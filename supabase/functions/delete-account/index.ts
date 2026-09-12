// Deletes a Kairo account permanently: revokes the Google Calendar OAuth
// grant, wipes the user's folder in the `recordings` Storage bucket, then
// deletes the auth.users row via the service role. Every user-owned table
// (profiles, deals, conversations, deal_state, stakeholders,
// fireflies_connections, calendar_connections, subscriptions,
// pending_schedule_intents, pending_calls) has an ON DELETE CASCADE FK to
// auth.users, so the single admin.deleteUser call below is what actually
// removes all of it -- confirmed against the live schema via
// pg_constraint.confdeltype before writing this (all 'c' except two
// unrelated SET NULL columns on scheduled_meetings/pending_calls that just
// null a pointer, not delete a row).
//
// Two things cascade does NOT reach, so this function handles them first:
//   1. The recordings Storage bucket -- audio objects aren't DB rows.
//   2. Google's own record of the OAuth grant -- deleting our
//      calendar_connections row stops Kairo from using the token, but
//      doesn't revoke it at Google's end. Best-effort revoke before delete.
//
// Fireflies is deliberately NOT touched here -- the user's Fireflies
// account and whatever Fireflies itself retains is a separate relationship
// the user has directly with that vendor; Kairo only stores an encrypted
// API key and a webhook secret, which cascade removes along with the
// fireflies_connections row.
//
// Auth pattern mirrors mobile-recording-review: verify the caller's own
// JWT via supabase.auth.getUser(token) against a service-role client.
// There is no server-triggered/service-role-token path here (unlike
// mobile-recording-review) -- account deletion must always be initiated
// by the account owner's own session, never by a service-to-service call,
// so that path is intentionally absent rather than merely unused.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Google's /revoke endpoint takes a bare token and needs no client
// id/secret, so none are required here.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Revokes a Google OAuth token via Google's standard revocation endpoint.
// Best-effort: if this fails (expired token, Google outage, token already
// revoked, etc.) we log and continue -- a failed revoke should never block
// account deletion, since the calendar_connections row is being deleted
// either way and the token becomes useless to Kairo regardless.
async function revokeGoogleToken(token: string): Promise<void> {
  try {
    const resp = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });
    if (!resp.ok) {
      console.error(`delete-account: Google token revoke returned ${resp.status}`);
    }
  } catch (err) {
    console.error('delete-account: Google token revoke failed:', err);
  }
}

// Refreshing before revoke isn't needed -- Google's /revoke endpoint
// accepts either an access token or a refresh token and invalidates the
// whole grant either way. Prefer the refresh token when present since it
// has a much longer lifetime and is more likely to still be valid.
async function revokeCalendarConnection(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  if (!conn) return;

  const tokenToRevoke = conn.refresh_token || conn.access_token;
  if (tokenToRevoke) {
    await revokeGoogleToken(tokenToRevoke as string);
  }
  // Row itself is removed by the cascade in the main delete below --
  // no need to delete it here separately.
}

// Deletes every object under the user's folder in the private `recordings`
// bucket. Storage paths are `{user_id}/{deal_id}/{conversation_id}.ext`
// (per mobile-recording-review and audio-retention-job), so listing by the
// `{user_id}` prefix and recursing one level into each deal folder covers
// every object regardless of how many deals/recordings exist.
async function wipeRecordingsFolder(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const { data: dealFolders, error: listError } = await supabase.storage
    .from('recordings')
    .list(userId);

  if (listError) {
    console.error('delete-account: failed to list recordings folder:', listError.message);
    return; // best-effort -- don't block deletion on Storage listing issues
  }
  if (!dealFolders || dealFolders.length === 0) return;

  const allPaths: string[] = [];

  for (const entry of dealFolders) {
    // Storage list() returns both files and "folders" (implicit, no id) at
    // the given prefix. A real file has an id; a folder entry doesn't --
    // recurse into folders one level to reach the actual audio files.
    if (entry.id === null) {
      const subPath = `${userId}/${entry.name}`;
      const { data: files } = await supabase.storage.from('recordings').list(subPath);
      if (files) {
        for (const file of files) {
          allPaths.push(`${subPath}/${file.name}`);
        }
      }
    } else {
      allPaths.push(`${userId}/${entry.name}`);
    }
  }

  if (allPaths.length === 0) return;

  const { error: removeError } = await supabase.storage.from('recordings').remove(allPaths);
  if (removeError) {
    // Best-effort -- log and continue. Leaving an orphaned audio file
    // behind is a much smaller problem than failing to delete the account,
    // and there is no owning DB row left afterward for anything to point to.
    console.error('delete-account: failed to remove some recordings objects:', removeError.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('delete-account: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return jsonRes({ error: 'Server misconfiguration' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    // The caller authenticates as themself -- there is deliberately no
    // service-role-token / user_id-in-body path here (unlike
    // mobile-recording-review). Account deletion must always be tied to a
    // live, valid session belonging to the account being deleted.
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }
    const userId = user.id;

    // Require the caller to re-state their own email as an explicit,
    // typed confirmation -- mirrors the confirmation the Settings UI
    // collects, and re-checked server-side so a replayed/forged request
    // without the right body can't slip through even if it somehow had a
    // valid token for a different flow.
    let body: { confirm_email?: string };
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: 'Invalid request body' }, 400);
    }

    const confirmEmail = (body.confirm_email || '').trim().toLowerCase();
    const actualEmail = (user.email || '').trim().toLowerCase();
    if (!confirmEmail || !actualEmail || confirmEmail !== actualEmail) {
      return jsonRes({ error: 'Email confirmation does not match account email' }, 400);
    }

    console.log(`delete-account: starting deletion for user ${userId}`);

    // 1. Best-effort revoke the Google OAuth grant before anything else
    //    removes our record of the token.
    await revokeCalendarConnection(supabase, userId);

    // 2. Best-effort wipe the Storage folder -- cascade won't touch this.
    await wipeRecordingsFolder(supabase, userId);

    // 3. Delete the auth.users row. This cascades through every
    //    user-owned table (verified ON DELETE CASCADE on all of them):
    //    profiles, deals, conversations, deal_state, stakeholders,
    //    fireflies_connections, calendar_connections, subscriptions,
    //    pending_schedule_intents, pending_calls.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error(`delete-account: admin.deleteUser failed for ${userId}:`, deleteError.message);
      return jsonRes({ error: 'Failed to delete account. Please try again or contact support.' }, 500);
    }

    console.log(`delete-account: completed deletion for user ${userId}`);

    return jsonRes({ ok: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return jsonRes({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});