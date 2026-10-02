import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  writeBackDealReview,
  resolveDealStageServer,
} from '../_shared/deal-writeback.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const GEMINI_MODEL_OVERRIDE = Deno.env.get('GEMINI_MODEL');
const TRANSCRIBE_MODEL = GEMINI_MODEL_OVERRIDE || 'gemini-3.6-flash';

const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;
const MAX_RETRY_ATTEMPTS = 7;

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'mp3':
      return 'audio/mpeg';
    case 'webm':
      return 'audio/webm';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    default:
      return 'audio/mp4';
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

async function transcribeInline(
  audioBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const audioB64 = arrayBufferToBase64(audioBytes);

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Transcribe this sales call audio verbatim. Label speakers as Rep: and Prospect: where you can distinguish them (use Speaker 1: / Speaker 2: if roles are unclear).',
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audioB64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      `Gemini transcription failed: ${err.error?.message || resp.statusText}`
    );
  }

  const data = await resp.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Recording too long to transcribe in one pass -- MAX_TOKENS_TRUNCATED'
    );
  }

  if (!text.trim()) {
    throw new Error('Gemini returned an empty transcript');
  }

  return text;
}

async function transcribeViaFilesApi(
  audioBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const uploadResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'raw',
        'Content-Type': mimeType,
      },
      body: audioBytes,
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({}));
    throw new Error(
      `Gemini Files API upload failed: ${
        err.error?.message || uploadResp.statusText
      }`
    );
  }

  const uploaded = await uploadResp.json();
  const fileUri: string = uploaded.file?.uri;
  const fileName: string = uploaded.file?.name;

  if (!fileUri || !fileName) {
    throw new Error(
      'Gemini Files API upload did not return a usable file reference'
    );
  }

  let state = uploaded.file?.state;
  let attempts = 0;

  while (state !== 'ACTIVE' && attempts < 20) {
    await new Promise((r) => setTimeout(r, 1500));

    const statusResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
    );

    const statusData = await statusResp.json();
    state = statusData.state;
    attempts++;
  }

  if (state !== 'ACTIVE') {
    throw new Error('Gemini file did not become ACTIVE in time');
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Transcribe this sales call audio verbatim. Label speakers as Rep: and Prospect: where you can distinguish them (use Speaker 1: / Speaker 2: if roles are unclear).',
              },
              {
                file_data: {
                  mime_type: mimeType,
                  file_uri: fileUri,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      `Gemini transcription (Files API) failed: ${
        err.error?.message || resp.statusText
      }`
    );
  }

  const data = await resp.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Recording too long to transcribe in one pass -- MAX_TOKENS_TRUNCATED'
    );
  }

  if (!text.trim()) {
    throw new Error('Gemini returned an empty transcript');
  }

  return text;
}

function nextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_RETRY_ATTEMPTS) return null;

  const delay =
    RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];

  return new Date(Date.now() + delay).toISOString();
}

function normalizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.slice(0, 2000);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonRes({ error: 'Server misconfiguration' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let conversationId: string | undefined;
  let processingStarted = false;

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    conversationId = body.conversation_id;

    if (!conversationId) {
      return jsonRes(
        { error: 'conversation_id is required' },
        400
      );
    }

    let userId: string;

    // Internal server-to-server path.
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      if (!body.user_id) {
        return jsonRes(
          { error: 'Missing user_id for server-triggered call' },
          400
        );
      }

      userId = body.user_id;
    } else {
      // Normal user session path.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return jsonRes({ error: 'Unauthorized' }, 401);
      }

      userId = user.id;
    }

    const {
      data: conversation,
      error: convFetchError,
    } = await supabase
      .from('conversations')
      .select(
        'id, deal_id, user_id, audio_url, status, transcript, analysis_json, retry_attempts'
      )
      .eq('id', conversationId)
      .single();

    if (convFetchError || !conversation) {
      return jsonRes(
        { error: 'Conversation not found' },
        404
      );
    }

    // Ownership must be checked BEFORE any mutation, including catch-state
    // updates. This prevents one user from causing another user's row to
    // become retry_pending/failed.
    if (conversation.user_id !== userId) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    if (!conversation.deal_id) {
      return jsonRes(
        {
          error:
            'Conversation has no deal_id -- deal must be selected before recording',
        },
        400
      );
    }

    // Fully complete rows are already done. This makes duplicate invocations
    // harmless and prevents accidental re-analysis.
    if (conversation.status === 'complete' && conversation.analysis_json) {
      return jsonRes({
        ok: true,
        conversation_id: conversationId,
        deal_id: conversation.deal_id,
        already_complete: true,
      });
    }

    // If analysis exists but the previous attempt failed during the writeback
    // phase, repair persistence without spending another Gemini call.
    if (
      conversation.analysis_json &&
      typeof conversation.analysis_json === 'object'
    ) {
      const { data: deal, error: dealFetchError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', conversation.deal_id)
        .single();

      if (dealFetchError || !deal) {
        throw new Error('Associated deal not found');
      }

      const resolvedStage = deal.deal_stage
        ? resolveDealStageServer(
            deal.deal_stage,
            conversation.analysis_json as any
          )
        : null;

      await writeBackDealReview(
        supabase,
        deal.id,
        userId,
        conversation.analysis_json as any,
        conversationId
      );

      const { error: repairUpdateError } = await supabase
        .from('conversations')
        .update({
          status: 'complete',
          deal_stage: resolvedStage,
          retry_after: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (repairUpdateError) {
        throw new Error(
          `Failed to repair conversation state: ${repairUpdateError.message}`
        );
      }

      return jsonRes({
        ok: true,
        conversation_id: conversationId,
        deal_id: conversation.deal_id,
        repaired: true,
      });
    }

    if (!conversation.transcript && !conversation.audio_url) {
      return jsonRes(
        {
          error:
            'Conversation has neither transcript nor audio_url -- there is nothing to process',
        },
        400
      );
    }

    // Atomically claim the conversation before starting work.
    const isRetry = body.retry_attempt === true;
    const { data: claimed, error: claimError } = await supabase.rpc(
      'claim_conversation_review',
      {
        p_conversation_id: conversationId,
        p_user_id: userId,
        p_retry: isRetry,
      }
    );

    if (claimError) {
      throw new Error(
        `Failed to claim conversation review: ${claimError.message}`
      );
    }

    if (!claimed) {
      return jsonRes(
        {
          error:
            'Conversation is not available for review (already processing or not pending)',
        },
        409
      );
    }

    // Only now is this run considered a processing attempt.
    processingStarted = true;

    // Prefer a previously saved transcript. This is critical for retries:
    // once transcription succeeded, retrying the analysis should not require
    // another Gemini transcription.
    let transcript =
      typeof conversation.transcript === 'string'
        ? conversation.transcript.trim()
        : '';

    if (transcript.length < 100) {
      if (!conversation.audio_url) {
        throw new Error(
          'Conversation transcript is missing and no audio is available for transcription'
        );
      }

      const {
        data: fileData,
        error: downloadError,
      } = await supabase.storage
        .from('recordings')
        .download(conversation.audio_url);

      if (downloadError || !fileData) {
        throw new Error(
          `Failed to download recording from Storage: ${
            downloadError?.message || 'Recording unavailable'
          }`
        );
      }

      const audioBytes = await fileData.arrayBuffer();
      const mimeType = guessMimeType(conversation.audio_url);

      console.log(
        `mobile-recording-review: conversation ${conversationId}, ${(audioBytes.byteLength / 1024 / 1024).toFixed(2)}MB, mime ${mimeType}`
      );

      transcript =
        audioBytes.byteLength < INLINE_LIMIT_BYTES
          ? await transcribeInline(audioBytes, mimeType)
          : await transcribeViaFilesApi(audioBytes, mimeType);

      if (transcript.trim().length < 100) {
        throw new Error(
          'Transcribed audio is too short to review'
        );
      }

      const { error: transcriptSaveError } = await supabase
        .from('conversations')
        .update({
          transcript,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (transcriptSaveError) {
        throw new Error(
          `Failed to save transcript: ${transcriptSaveError.message}`
        );
      }
    } else {
      console.log(
        `mobile-recording-review: reusing saved transcript for conversation ${conversationId}`
      );
    }

    if (transcript.length > 50000) {
      throw new Error(
        'Transcript is too long. Please trim it to under 50,000 characters.'
      );
    }

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', conversation.deal_id)
      .single();

    if (dealError || !deal) {
      throw new Error('Associated deal not found');
    }

    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('what_you_sell, who_you_are')
      .eq('id', userId)
      .single();

    const [existingCallsRes, activeRisksRes, dealStateRes, stakeholdersRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('created_at, deal_stage, analysis_json')
        .eq('deal_id', deal.id)
        .neq('id', conversationId)
        .eq('status', 'complete')
        .not('analysis_json', 'is', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('deal_risks')
        .select('*')
        .eq('deal_id', deal.id)
        .in('status', ['active', 'recurring']),
      supabase
        .from('deal_state')
        .select('*')
        .eq('deal_id', deal.id)
        .maybeSingle(),
      supabase
        .from('stakeholders')
        .select('*')
        .eq('deal_id', deal.id),
    ]);

    const existingCalls = existingCallsRes.data || [];
    const previousReview =
      existingCalls.length > 0
        ? existingCalls[existingCalls.length - 1].analysis_json
        : null;

    const pastCalls = existingCalls.map((c: any) => ({
      stage: c.deal_stage,
      status: c.analysis_json?.deal?.status,
      verdict: c.analysis_json?.call?.verdict,
      date: c.created_at,
    }));

    const longitudinalHistory = {
      past_calls: pastCalls,
      active_risks: (activeRisksRes.data || []).map((r: any) => ({
        title: r.title,
        severity: r.severity,
        why_it_matters: r.why_it_matters,
        consecutive_calls: r.consecutive_unresolved_calls,
      })),
      pillars: dealStateRes.data?.pillars || null,
      stakeholders: (stakeholdersRes.data || []).map((s: any) => ({
        name: s.name,
        role: s.role,
        sentiment: s.sentiment,
      })),
    };

    const reviewRes = await fetch(
      `${SUPABASE_URL}/functions/v1/call-review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          conversation_id: conversationId,
          transcript,
          deal_context: {
            deal_id: deal.id,
            conversation_id: conversationId,
            deal_name: deal.deal_name,
            company_name: deal.company_name,
            deal_stage: deal.deal_stage,
            previous_review: previousReview,
            longitudinal_history: longitudinalHistory,
          },
          seller_context: {
            what_you_sell:
              sellerProfile?.what_you_sell || undefined,
            who_you_are:
              sellerProfile?.who_you_are || undefined,
          },
        }),
      }
    );

    const reviewData = await reviewRes.json();

    if (!reviewRes.ok || !reviewData.review) {
      throw new Error(
        reviewData.error ||
          'call-review did not return a valid review'
      );
    }

    const review = reviewData.review;

    const resolvedStage = deal.deal_stage
      ? resolveDealStageServer(
          deal.deal_stage,
          review
        )
      : (deal.deal_stage ?? null);

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        transcript,
        analysis_json: review,
        status: 'complete',
        deal_stage: resolvedStage,
        retry_after: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (updateError) {
      throw new Error(
        `Failed to save analysis: ${updateError.message}`
      );
    }

    await writeBackDealReview(
      supabase,
      deal.id,
      userId,
      review,
      conversationId
    );

    if (conversation.meeting_id) {
      await supabase
        .from('meetings')
        .update({
          conversation_id: conversationId,
          matched_conversation_id: conversationId,
          status: 'completed',
          capture_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.meeting_id);
    }

    console.log(
      `mobile-recording-review: completed conversation ${conversationId} for deal ${deal.id}`
    );

    return jsonRes({
      ok: true,
      conversation_id: conversationId,
      deal_id: deal.id,
    });
  } catch (err) {
    const errorMessage = normalizeError(err);

    console.error(
      'mobile-recording-review error:',
      errorMessage
    );

    // Only the run that actually entered processing is allowed to change
    // retry state. Ownership was already verified before this flag was set.
    if (conversationId && processingStarted) {
      try {
        const { data: current } = await supabase
          .from('conversations')
          .select('retry_attempts, status')
          .eq('id', conversationId)
          .maybeSingle();

        const attempts =
          typeof current?.retry_attempts === 'number'
            ? current.retry_attempts
            : 0;
        const nextAttempts = attempts + 1;

        const retryAfter = nextRetryAt(attempts);

        if (retryAfter) {
          const { error: retryStateError } = await supabase
            .from('conversations')
            .update({
              status: 'retry_pending',
              retry_attempts: nextAttempts,
              retry_after: retryAfter,
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);

          if (retryStateError) {
            console.error(
              `mobile-recording-review: failed to queue retry for ${conversationId}:`,
              retryStateError.message
            );
          }
        } else {
          const { error: terminalError } = await supabase
            .from('conversations')
            .update({
              status: 'failed',
              retry_attempts: nextAttempts,
              retry_after: null,
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);

          if (terminalError) {
            console.error(
              `mobile-recording-review: failed to mark ${conversationId} terminally failed:`,
              terminalError.message
            );
          }
        }
      } catch (retryStateHandlerError) {
        console.error(
          'mobile-recording-review: retry-state update threw:',
          retryStateHandlerError
        );
      }
    }

    return jsonRes(
      {
        error: errorMessage,
      },
      500
    );
  }
});