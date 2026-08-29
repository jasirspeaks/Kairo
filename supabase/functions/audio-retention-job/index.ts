// Scheduled via pg_cron (see migration schedule_audio_retention_job).
// Not user-facing, no auth beyond a shared secret check against the
// cron job's own invocation (service-role equivalent, this project has
// no external caller for this function).
//
// Policy:
//   - status = 'complete' AND audio_url is not null AND audio_deleted_at
//     is null AND updated_at < now() - 48 hours -> delete audio, stamp
//     audio_deleted_at.
//   - status in ('failed', 'processing', 'pending') AND audio_url is not
//     null AND audio_deleted_at is null AND updated_at < now() - 7 days
//     -> delete audio, stamp audio_deleted_at. (processing/pending this
//     old means something got stuck -- treat like failed rather than
//     leaving the audio around indefinitely.)
//
// Deletes from Storage first, only stamps audio_deleted_at if the
// Storage delete actually succeeds (or the object is already gone) --
// avoids marking an object deleted when it wasn't, which would make a
// stuck retry permanently invisible to future runs of this job.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('RETENTION_JOB_SECRET');

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  const providedSecret = req.headers.get('x-retention-job-secret');
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const now = Date.now();
  const completeThreshold = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const staleThreshold = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const results = { deleted: [] as string[], skipped_no_object: [] as string[], errors: [] as { id: string; error: string }[] };

  try {
    const { data: completeRows, error: completeErr } = await supabase
      .from('conversations')
      .select('id, audio_url')
      .eq('status', 'complete')
      .not('audio_url', 'is', null)
      .is('audio_deleted_at', null)
      .lt('updated_at', completeThreshold);

    if (completeErr) throw completeErr;

    const { data: staleRows, error: staleErr } = await supabase
      .from('conversations')
      .select('id, audio_url')
      .in('status', ['failed', 'processing', 'pending'])
      .not('audio_url', 'is', null)
      .is('audio_deleted_at', null)
      .lt('updated_at', staleThreshold);

    if (staleErr) throw staleErr;

    const eligible = [...(completeRows ?? []), ...(staleRows ?? [])];

    for (const row of eligible) {
      try {
        const { error: removeErr } = await supabase.storage.from('recordings').remove([row.audio_url]);

        // Supabase Storage's remove() doesn't error on a missing object --
        // it returns success either way. Only a real API/permission error
        // lands here; treat that as retryable (don't stamp deleted_at).
        if (removeErr) {
          results.errors.push({ id: row.id, error: removeErr.message });
          continue;
        }

        const { error: updateErr } = await supabase
          .from('conversations')
          .update({ audio_deleted_at: new Date().toISOString() })
          .eq('id', row.id);

        if (updateErr) {
          results.errors.push({ id: row.id, error: `Storage deleted but DB update failed: ${updateErr.message}` });
          continue;
        }

        results.deleted.push(row.id);
      } catch (rowErr) {
        results.errors.push({ id: row.id, error: rowErr instanceof Error ? rowErr.message : String(rowErr) });
      }
    }

    console.log(`audio-retention-job: deleted ${results.deleted.length}, errors ${results.errors.length}`);

    return jsonRes({ ok: true, ...results });
  } catch (err) {
    console.error('audio-retention-job error:', err);
    return jsonRes({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});