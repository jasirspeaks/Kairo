import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  writeBackDealReview,
  resolveDealStageServer,
} from '../_shared/deal-writeback.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  'SUPABASE_SERVICE_ROLE_KEY'
);
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const GEMINI_MODEL_OVERRIDE = Deno.env.get('GEMINI_MODEL');
const TRANSCRIBE_MODEL =
  GEMINI_MODEL_OVERRIDE || 'gemini-3.6-flash';

const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;

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
    default:
      return 'audio/mp4';
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 8192;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}

async function transcribeInline(
  audioBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const audioB64 = arrayBufferToBase64(audioBytes);

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      `Gemini transcription failed: ${
        err.error?.message || resp.statusText
      }`
    );
  }

  const data = await resp.json();

  const finishReason =
    data.candidates?.[0]?.finishReason;

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Recording too long to transcribe in one pass -- MAX_TOKENS_TRUNCATED'
    );
  }

  if (!text.trim()) {
    throw new Error(
      'Gemini returned an empty transcript'
    );
  }

  return text;
}

async function transcribeViaFilesApi(
  audioBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
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
    throw new Error(
      'Gemini file did not become ACTIVE in time'
    );
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

  const finishReason =
    data.candidates?.[0]?.finishReason;

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Recording too long to transcribe in one pass -- MAX_TOKENS_TRUNCATED'
    );
  }

  if (!text.trim()) {
    throw new Error(
      'Gemini returned an empty transcript'
    );
  }

  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  const supabase = createClient(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!
  );

  let conversationId: string | undefined;

  try {
    const authHeader =
      req.headers.get('Authorization');

    if (!authHeader) {
      return jsonRes(
        { error: 'Unauthorized' },
        401
      );
    }

    const token = authHeader.replace(
      'Bearer ',
      ''
    );

    const body = await req.json();

    conversationId = body.conversation_id;

    if (!conversationId) {
      return jsonRes(
        { error: 'conversation_id is required' },
        400
      );
    }

    let userId: string;

    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      if (!body.user_id) {
        return jsonRes(
          {
            error:
              'Missing user_id for server-triggered call',
          },
          400
        );
      }

      userId = body.user_id;
    } else {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return jsonRes(
          { error: 'Unauthorized' },
          401
        );
      }

      userId = user.id;
    }

    const {
      data: conversation,
      error: convFetchError,
    } = await supabase
      .from('conversations')
      .select(
        'id, deal_id, user_id, audio_url, status, transcript'
      )
      .eq('id', conversationId)
      .single();

    if (convFetchError || !conversation) {
      return jsonRes(
        { error: 'Conversation not found' },
        404
      );
    }

    if (conversation.user_id !== userId) {
      return jsonRes(
        { error: 'Unauthorized' },
        401
      );
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

    if (!conversation.audio_url) {
      return jsonRes(
        {
          error:
            'Conversation has no audio_url -- upload must complete before calling this function',
        },
        400
      );
    }

    // Mark the conversation as processing before doing any Gemini work.
    //
    // The retention job deliberately does NOT delete processing/failed
    // recordings, so this source material remains available if anything
    // fails below.
    const { error: processingUpdateError } =
      await supabase
        .from('conversations')
        .update({
          status: 'processing',
        })
        .eq('id', conversationId);

    if (processingUpdateError) {
      throw new Error(
        `Failed to mark conversation as processing: ${processingUpdateError.message}`
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
        `Failed to download recording from Storage: ${downloadError?.message || 'Recording unavailable'}`
      );
    }

    const audioBytes =
      await fileData.arrayBuffer();

    const mimeType = guessMimeType(
      conversation.audio_url
    );

    console.log(
      `mobile-recording-review: conversation ${conversationId}, ${(audioBytes.byteLength / 1024 / 1024).toFixed(2)}MB, mime ${mimeType}`
    );

    const transcript =
      audioBytes.byteLength < INLINE_LIMIT_BYTES
        ? await transcribeInline(
            audioBytes,
            mimeType
          )
        : await transcribeViaFilesApi(
            audioBytes,
            mimeType
          );

    if (transcript.trim().length < 100) {
      throw new Error(
        'Transcribed audio is too short to review'
      );
    }

    // IMPORTANT:
    // Persist the transcript BEFORE asking call-review/Gemini to perform
    // the deal analysis.
    //
    // If the downstream review fails, we now still have the actual
    // material that needs reviewing. The retry path can use this
    // transcript later without needing to transcribe the recording again.
    const { error: transcriptSaveError } =
      await supabase
        .from('conversations')
        .update({
          transcript,
        })
        .eq('id', conversationId);

    if (transcriptSaveError) {
      throw new Error(
        `Failed to save transcript: ${transcriptSaveError.message}`
      );
    }

    const { data: deal } = await supabase
      .from('deals')
      .select('*')
      .eq('id', conversation.deal_id)
      .single();

    if (!deal) {
      throw new Error(
        'Associated deal not found'
      );
    }

    const { data: sellerProfile } =
      await supabase
        .from('profiles')
        .select(
          'what_you_sell, who_you_are'
        )
        .eq('id', userId)
        .single();

    const { data: existingCalls } =
      await supabase
        .from('conversations')
        .select('analysis_json')
        .eq('deal_id', deal.id)
        .neq('id', conversationId)
        .eq('status', 'complete')
        .not('analysis_json', 'is', null)
        .order('created_at', {
          ascending: true,
        });

    const previousReview =
      existingCalls &&
      existingCalls.length > 0
        ? existingCalls[
            existingCalls.length - 1
          ].analysis_json
        : null;

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
          transcript,
          deal_context: {
            deal_name: deal.deal_name,
            company_name: deal.company_name,
            deal_stage: deal.deal_stage,
            previous_review: previousReview,
          },
          seller_context: {
            what_you_sell:
              sellerProfile?.what_you_sell ||
              undefined,
            who_you_are:
              sellerProfile?.who_you_are ||
              undefined,
          },
        }),
      }
    );

    const reviewData =
      await reviewRes.json();

    if (
      !reviewRes.ok ||
      !reviewData.review
    ) {
      throw new Error(
        reviewData.error ||
          'call-review did not return a valid review'
      );
    }

    const review =
      reviewData.review;

    // Resolve the post-call stage BEFORE updating the conversation row, so
    // deal_stage on that row is the stage this call resulted in.
    const resolvedStage =
      deal.deal_stage
        ? resolveDealStageServer(
            deal.deal_stage,
            review
          )
        : (deal.deal_stage ?? null);

    const {
      error: updateError,
    } = await supabase
      .from('conversations')
      .update({
        transcript,
        analysis_json: review,
        status: 'complete',
        deal_stage: resolvedStage,
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
      review
    );

    console.log(
      `mobile-recording-review: completed conversation ${conversationId} for deal ${deal.id}`
    );

    return jsonRes({
      ok: true,
      conversation_id: conversationId,
      deal_id: deal.id,
    });
  } catch (err) {
    console.error(
      'mobile-recording-review error:',
      err
    );

    if (conversationId) {
      try {
        // Do NOT delete the transcript or audio here.
        //
        // A failed review is intentionally recoverable. The future retry
        // worker will pick this conversation back up and attempt the
        // analysis again.
        const { error: failureUpdateError } =
          await supabase
            .from('conversations')
            .update({
              status: 'failed',
            })
            .eq('id', conversationId);

        if (failureUpdateError) {
          console.error(
            `mobile-recording-review: failed to mark ${conversationId} as failed:`,
            failureUpdateError.message
          );
        }
      } catch (failureHandlerError) {
        console.error(
          'mobile-recording-review: failure-state update threw:',
          failureHandlerError
        );
      }
    }

    return jsonRes(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Internal server error',
      },
      500
    );
  }
});