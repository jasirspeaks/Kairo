// Scheduled via pg_cron (see migration schedule_audio_retention_job).
// Not user-facing, no auth beyond a shared secret check against the
// cron job's own invocation (service-role equivalent, this project has
// no external caller for this function).
//
// Policy:
//   - audio_url is not null AND audio_deleted_at is null AND created_at < now() - 48 hours
//     -> delete audio from Storage, stamp audio_deleted_at.
//
// Universal 48-Hour Purge:
//   Audio objects in the recordings Storage bucket are purged strictly after 48 hours
//   regardless of conversation status ('complete', 'failed', 'retry_pending', etc.).
//   All automatic review retries exhaust their attempts within ~8 hours total.
//   Once transcribed, conversations save the transcript text directly in the database,
//   so audio is no longer needed for subsequent analysis. Purging after 48h guarantees
//   user data privacy and storage cost bounds.
//
// Deletes from Storage first, only stamps audio_deleted_at if the
// Storage delete actually succeeds (or the object is already gone) --
// avoids marking an object deleted when it wasn't, which would make a
// future retention attempt permanently invisible.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('RETENTION_JOB_SECRET');

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  const providedSecret = req.headers.get('x-retention-job-secret');

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = Date.now();

  // Any recording older than 48 hours is eligible for audio cleanup.
  const cutoffThreshold = new Date(
    now - 48 * 60 * 60 * 1000
  ).toISOString();

  const results = {
    deleted: [] as string[],
    skipped_no_object: [] as string[],
    errors: [] as { id: string; error: string }[],
  };

  try {
    // Universal 48-hour purge: all recordings older than 48h with un-deleted
    // audio are purged regardless of status ('complete', 'failed', 'retry_pending').
    const { data: eligibleRows, error: fetchErr } = await supabase
      .from('conversations')
      .select('id, audio_url')
      .not('audio_url', 'is', null)
      .is('audio_deleted_at', null)
      .lt('created_at', cutoffThreshold);

    if (fetchErr) {
      throw fetchErr;
    }

    for (const row of eligibleRows ?? []) {
      try {
        const { error: removeErr } = await supabase.storage
          .from('recordings')
          .remove([row.audio_url]);

        // Supabase Storage's remove() does not error when an object is
        // already gone. A real API/permission failure lands here.
        //
        // Do NOT stamp audio_deleted_at on failure because another
        // retention run should be able to try again.
        if (removeErr) {
          results.errors.push({
            id: row.id,
            error: removeErr.message,
          });
          continue;
        }

        const { error: updateErr } = await supabase
          .from('conversations')
          .update({
            audio_deleted_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updateErr) {
          results.errors.push({
            id: row.id,
            error: `Storage deleted but DB update failed: ${updateErr.message}`,
          });
          continue;
        }

        results.deleted.push(row.id);
      } catch (rowErr) {
        results.errors.push({
          id: row.id,
          error:
            rowErr instanceof Error
              ? rowErr.message
              : String(rowErr),
        });
      }
    }

    console.log(
      `audio-retention-job: deleted ${results.deleted.length}, errors ${results.errors.length}`
    );

    return jsonRes({
      ok: true,
      ...results,
    });
  } catch (err) {
    console.error('audio-retention-job error:', err);

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