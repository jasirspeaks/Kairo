import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RETRY_CALL_REVIEWS_JOB_SECRET = Deno.env.get(
  'RETRY_CALL_REVIEWS_JOB_SECRET'
);

const MAX_ATTEMPTS = 7;
const BATCH_SIZE = 1;

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
  'Content-Type': 'application/json',
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function nextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;

  const delay =
    RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];

  return new Date(Date.now() + delay).toISOString();
}

function isAuthorized(req: Request): boolean {
  const providedJobSecret = req.headers.get(
    'x-retry-call-reviews-job-secret'
  );

  if (
    RETRY_CALL_REVIEWS_JOB_SECRET &&
    providedJobSecret === RETRY_CALL_REVIEWS_JOB_SECRET
  ) {
    return true;
  }

  // Temporary backward-compatible internal path while the dedicated cron
  // secret is being provisioned. The service-role key must never be exposed
  // to the browser or stored in cron SQL.
  const authHeader = req.headers.get('Authorization');

  return (
    !!SUPABASE_SERVICE_ROLE_KEY &&
    authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  );
}

async function requeueOrFail(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; user_id?: string; processing_token?: string; retry_attempts: number },
  errorMessage: string
) {
  const retryAfter = nextRetryAt(job.retry_attempts);
  const safeError = errorMessage.slice(0, 2000);

  if (job.user_id && job.processing_token) {
    const { error } = await supabase.rpc('fail_or_retry_conversation_review', {
      p_conversation_id: job.id,
      p_user_id: job.user_id,
      p_processing_token: job.processing_token,
      p_error_message: safeError,
      p_retry_after: retryAfter,
    });

    if (error) {
      console.error(
        `retry-call-reviews: fail_or_retry RPC failed for ${job.id}:`,
        error.message
      );
    }
  } else {
    if (retryAfter) {
      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'retry_pending',
          retry_after: retryAfter,
          last_error: safeError,
          processing_lease_until: null,
          processing_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) {
        console.error(
          `retry-call-reviews: failed to requeue ${job.id}:`,
          error.message
        );
      }
    } else {
      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'failed',
          retry_after: null,
          last_error: safeError,
          processing_lease_until: null,
          processing_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) {
        console.error(
          `retry-call-reviews: failed to terminally fail ${job.id}:`,
          error.message
        );
      }
    }
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonRes({ error: 'Server misconfiguration' }, 500);
  }

  if (!isAuthorized(req)) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: jobs, error: claimError } = await supabase.rpc(
      'claim_call_review_retry',
      {
        p_max_attempts: MAX_ATTEMPTS,
        p_batch_size: BATCH_SIZE,
      }
    );

    if (claimError) {
      throw claimError;
    }

    if (!jobs || jobs.length === 0) {
      return jsonRes({
        ok: true,
        processed: 0,
      });
    }

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/mobile-recording-review`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
              conversation_id: job.id,
              user_id: job.user_id,
              retry_attempt: true,
              processing_token: job.processing_token,
            }),
          }
        );

        if (response.ok) {
          completed++;

          console.log(
            JSON.stringify({
              event: 'retry_worker_completed',
              conversation_id: job.id,
              attempt: job.retry_attempts,
              processing_token_prefix: job.processing_token?.slice(0, 8),
            })
          );

          continue;
        }

        const responseBody = await response.json().catch(() => ({}));

        const errorMessage =
          typeof responseBody?.error === 'string'
            ? responseBody.error
            : `mobile-recording-review returned HTTP ${response.status}`;

        // Normally mobile-recording-review owns the retry-state transition.
        // If the downstream function unexpectedly leaves the row in
        // processing, repair that state here so a worker failure cannot strand
        // the conversation forever.
        const { data: current } = await supabase
          .from('conversations')
          .select('status')
          .eq('id', job.id)
          .maybeSingle();

        if (current?.status === 'processing') {
          await requeueOrFail(
            supabase,
            job,
            errorMessage
          );
        }

        failed++;

        console.error(
          JSON.stringify({
            event: 'retry_worker_failed',
            conversation_id: job.id,
            attempt: job.retry_attempts,
            processing_token_prefix: job.processing_token?.slice(0, 8),
            status: response.status,
            error: errorMessage,
          })
        );
      } catch (err) {
        failed++;

        const errorMessage =
          err instanceof Error ? err.message : String(err);

        // Covers network/edge failures where the called function never gets
        // a chance to transition the claimed row out of processing.
        await requeueOrFail(
          supabase,
          job,
          errorMessage
        );

        console.error(
          JSON.stringify({
            event: 'retry_worker_invocation_failed',
            conversation_id: job.id,
            attempt: job.retry_attempts,
            processing_token_prefix: job.processing_token?.slice(0, 8),
            error: errorMessage,
          })
        );
      }
    }

    return jsonRes({
      ok: true,
      processed: jobs.length,
      completed,
      failed,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Internal server error';

    console.error(
      'retry-call-reviews error:',
      message
    );

    return jsonRes(
      { error: message },
      500
    );
  }
});