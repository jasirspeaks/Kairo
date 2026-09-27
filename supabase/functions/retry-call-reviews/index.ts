import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const MAX_ATTEMPTS = 7;
const BATCH_SIZE = 1;

const corsHeaders = {
  'Content-Type': 'application/json',
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');

  if (
    !authHeader ||
    authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  ) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!
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
            body: JSON.stringify({
              conversation_id: job.id,
              user_id: job.user_id,
            }),
          }
        );

        if (response.ok) {
          completed++;

          console.log(
            `retry-call-reviews: completed ${job.id} ` +
            `(attempt ${job.retry_attempts})`
          );
        } else {
          failed++;

          const responseText = await response.text().catch(() => '');

          console.error(
            `retry-call-reviews: review failed for ${job.id}: ` +
            `${response.status} ${responseText}`
          );
        }
      } catch (err) {
        failed++;

        console.error(
          `retry-call-reviews: invocation failed for ${job.id}:`,
          err
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
    console.error('retry-call-reviews error:', err);

    return jsonRes({
      error: err instanceof Error
        ? err.message
        : 'Internal server error',
    }, 500);
  }
});