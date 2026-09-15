// Scheduled via pg_cron (see migration schedule_expire_trials_job).
// Not user-facing, no auth beyond a shared secret check against the
// cron job's own invocation (service-role equivalent, this project has
// no external caller for this function).
//
// Policy:
//   - status = 'trialing' AND trial_end < now() -> status = 'expired'.
//
// This function only ever moves 'trialing' rows forward. It never
// touches 'active', 'past_due', or 'canceled' rows -- those states are
// owned by the Stripe webhook (Phase 2), not the trial clock. This
// keeps the two lifecycles from fighting over the same column.
//
// Downstream effect: once a row is 'expired', RLS insert policies on
// conversations/deals (see migration restrict_writes_to_active_subscription)
// block that user from creating new deals or calls. Existing rows stay
// fully readable -- this job only ever changes `status`, never deletes
// or hides anything.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('EXPIRE_TRIALS_JOB_SECRET');

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  const providedSecret = req.headers.get('x-expire-trials-job-secret');
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const nowIso = new Date().toISOString();

  try {
    const { data: expired, error: updateErr } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'trialing')
      .lt('trial_end', nowIso)
      .select('user_id');

    if (updateErr) throw updateErr;

    const expiredCount = expired?.length ?? 0;
    console.log(`expire-trials-job: expired ${expiredCount} trial(s)`);

    return jsonRes({ ok: true, expired_count: expiredCount, expired_user_ids: (expired ?? []).map(r => r.user_id) });
  } catch (err) {
    console.error('expire-trials-job error:', err);
    return jsonRes({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});
