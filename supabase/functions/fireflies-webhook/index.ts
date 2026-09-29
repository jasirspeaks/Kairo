import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { writeBackDealReview, resolveDealStageServer } from '../_shared/deal-writeback.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKeyB64 = Deno.env.get('FIREFLIES_ENCRYPTION_KEY');
  if (!rawKeyB64) throw new Error('FIREFLIES_ENCRYPTION_KEY is not set');
  const rawKey = Uint8Array.from(atob(rawKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptSecret(stored: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = stored.split(':');
  if (!ivB64 || !ctB64) throw new Error('Malformed encrypted secret');
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintextBuf);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature',
};

const TRANSCRIPT_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id
      title
      dateString
      participants
      sentences {
        speaker_name
        text
      }
    }
  }
`;

async function fetchTranscript(meetingId: string, apiKey: string) {
  const res = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: TRANSCRIPT_QUERY, variables: { id: meetingId } }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(`Fireflies API error: ${JSON.stringify(json.errors)}`);
  return json.data?.transcript;
}

async function isValidSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const receivedDigest = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;

  return digest === receivedDigest;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  let claimedEventId: string | null = null;
  let userId: string | null = null;

  try {
    const url = new URL(req.url);
    userId = url.searchParams.get('user_id');

    if (!userId) return jsonRes({ error: 'Missing user_id' }, 400);

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature');
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: connection } = await supabase
      .from('fireflies_connections')
      .select('id, encrypted_api_key, webhook_secret, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (!connection) return jsonRes({ error: 'No Fireflies connection for this user' }, 404);

    if (!(await isValidSignature(rawBody, signature, connection.webhook_secret))) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    const body = JSON.parse(rawBody);

    console.log('Fireflies webhook received:', {
      meetingId: body.meetingId ?? body.meeting_id ?? body.id ?? null,
      eventType: body.eventType ?? body.event ?? body.type ?? null,
      bodyBytes: rawBody.length,
    });

    const meetingId: string | undefined = body.meetingId ?? body.meeting_id ?? body.id;
    const eventType: string | undefined = body.eventType ?? body.event ?? body.type;

    await supabase
      .from('fireflies_connections')
      .update({ status: 'active', last_webhook_received_at: new Date().toISOString(), last_error: null })
      .eq('id', connection.id);

    if (eventType && eventType.toLowerCase() === 'test') {
      return jsonRes({ ok: true, test: true });
    }

    if (!meetingId) return jsonRes({ error: 'Missing meetingId', received: body }, 400);

    const apiKey = await decryptSecret(connection.encrypted_api_key);
    const transcriptData = await fetchTranscript(meetingId, apiKey);

    if (!transcriptData) return jsonRes({ error: 'Transcript not found on Fireflies' }, 404);

    const transcriptText: string = (transcriptData.sentences ?? [])
      .map((s: any) => `${s.speaker_name ?? 'Unknown'}: ${s.text}`)
      .join('\n');

    if (!transcriptText || transcriptText.trim().length < 100) {
      return jsonRes({ error: 'Transcript missing or too short' }, 400);
    }

    // Durable idempotency claim happens only once the webhook is known to be
    // a usable transcript. Failed claims are reclaimable after 15 minutes.
    const { data: claimRows, error: claimError } = await supabase.rpc('claim_fireflies_webhook', {
      p_user_id: userId,
      p_meeting_id: meetingId,
    });

    if (claimError) throw new Error(`Failed to claim Fireflies webhook: ${claimError.message}`);

    const claim = claimRows?.[0];
    if (!claim?.claimed) {
      return jsonRes({
        ok: true,
        already_processed: true,
        auto_matched: false,
        conversation_id: claim?.conversation_id ?? null,
      });
    }

    claimedEventId = claim.event_id;

    const meetingTime = transcriptData.dateString ? new Date(transcriptData.dateString) : null;
    let matchedMeeting: { id: string; deal_id: string; title: string | null } | null = null;

    try {
      if (meetingTime && !isNaN(meetingTime.getTime())) {
        const windowMs = 3 * 60 * 60 * 1000;
        const windowStart = new Date(meetingTime.getTime() - windowMs).toISOString();
        const windowEnd = new Date(meetingTime.getTime() + windowMs).toISOString();

        const { data: candidates } = await supabase
          .from('scheduled_meetings')
          .select('id, deal_id, title, start_time')
          .eq('user_id', userId)
          .eq('status', 'assigned')
          .gte('start_time', windowStart)
          .lte('start_time', windowEnd);

        if (candidates && candidates.length === 1) {
          matchedMeeting = candidates[0] as any;
        } else if (candidates && candidates.length > 1) {
          const ranked = candidates
            .map((c: any) => ({
              ...c,
              distanceMs: Math.abs(new Date(c.start_time).getTime() - meetingTime.getTime()),
            }))
            .sort((a, b) => a.distanceMs - b.distanceMs);

          const closest = ranked[0];
          const secondClosest = ranked[1];
          const MIN_SEPARATION_MS = 20 * 60 * 1000;

          if (secondClosest.distanceMs - closest.distanceMs >= MIN_SEPARATION_MS) {
            matchedMeeting = closest;
          } else {
            console.log(
              `Ambiguous match for user ${userId}: closest candidates ${closest.distanceMs}ms and ${secondClosest.distanceMs}ms apart from meeting time -- no automatic match.`
            );
          }
        }
      }

      if (matchedMeeting) {
        const { data: deal } = await supabase
          .from('deals')
          .select('*')
          .eq('id', matchedMeeting.deal_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!deal) {
          throw new Error('Matched scheduled_meeting points to a missing or foreign deal');
        }

        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('what_you_sell, who_you_are')
          .eq('id', userId)
          .single();

        const { data: existingCalls } = await supabase
          .from('conversations')
          .select('analysis_json')
          .eq('deal_id', deal.id)
          .eq('status', 'complete')
          .not('analysis_json', 'is', null)
          .order('created_at', { ascending: true });

        const previousReview =
          existingCalls && existingCalls.length > 0
            ? existingCalls[existingCalls.length - 1].analysis_json
            : null;

        const reviewRes = await fetch(`${SUPABASE_URL}/functions/v1/call-review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            transcript: transcriptText,
            deal_context: {
              deal_name: deal.deal_name,
              company_name: deal.company_name,
              deal_stage: deal.deal_stage,
              previous_review: previousReview,
            },
            seller_context: {
              what_you_sell: sellerProfile?.what_you_sell || undefined,
              who_you_are: sellerProfile?.who_you_are || undefined,
            },
          }),
        });

        const reviewData = await reviewRes.json();
        if (!reviewRes.ok || !reviewData.review) {
          throw new Error(reviewData.error || 'Auto-review failed');
        }

        const review = reviewData.review;
        const resolvedStage = deal.deal_stage
          ? resolveDealStageServer(deal.deal_stage, review)
          : (deal.deal_stage ?? null);

        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: userId,
            deal_id: deal.id,
            title: matchedMeeting.title || transcriptData.title || 'Call',
            input_type: 'transcript',
            transcript: transcriptText,
            status: 'complete',
            analysis_json: review,
            deal_stage: resolvedStage,
          })
          .select()
          .single();

        if (convError || !newConv) {
          throw new Error(
            `Failed to save auto-matched conversation: ${convError?.message || 'No conversation returned'}`
          );
        }

        await writeBackDealReview(supabase, deal.id, userId, review);

        const { error: meetingUpdateError } = await supabase
          .from('scheduled_meetings')
          .update({
            status: 'completed',
            matched_conversation_id: newConv.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedMeeting.id)
          .eq('user_id', userId);

        if (meetingUpdateError) {
          throw new Error(`Failed to mark scheduled meeting completed: ${meetingUpdateError.message}`);
        }

        if (claimedEventId) {
          const { error: finishError } = await supabase.rpc('finish_fireflies_webhook', {
            p_event_id: claimedEventId,
            p_conversation_id: newConv.id,
          });

          if (finishError) throw new Error(`Failed to finalize Fireflies webhook: ${finishError.message}`);
        }

        console.log(`Auto-matched and reviewed call for deal ${deal.id}, meeting ${matchedMeeting.id}`);
        return jsonRes({ ok: true, auto_matched: true, deal_id: deal.id });
      }
    } catch (matchErr) {
      console.error('Auto-match/review block failed:', matchErr instanceof Error ? matchErr.message : 'Unknown error');
      throw matchErr;
    }

    if (claimedEventId) {
      await supabase.rpc('fail_fireflies_webhook', {
        p_event_id: claimedEventId,
        p_error: 'Could not automatically match this Fireflies call to an assigned Kairo meeting.',
      });
    }

    console.log('Fireflies call could not be auto-matched to a deal; retained as a retryable webhook event:', {
      userId,
      meetingId,
      externalId: transcriptData.id ?? meetingId,
      title: transcriptData.title ?? null,
      meetingDate: transcriptData.dateString ?? null,
    });

    return jsonRes({ ok: true, auto_matched: false });
  } catch (err) {
    console.error('fireflies-webhook error:', err instanceof Error ? err.message : 'Unknown error');

    try {
      if (claimedEventId) {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        await supabase.rpc('fail_fireflies_webhook', {
          p_event_id: claimedEventId,
          p_error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } catch (claimErr) {
      console.error(
        'fireflies-webhook: failed to release webhook claim:',
        claimErr instanceof Error ? claimErr.message : 'Unknown error'
      );
    }

    try {
      if (userId) {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        await supabase
          .from('fireflies_connections')
          .update({ last_error: err instanceof Error ? err.message : 'Unknown error' })
          .eq('user_id', userId);
      }
    } catch {
      // Swallow -- we're already in the top-level error handler.
    }

    return jsonRes(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    );
  }
});