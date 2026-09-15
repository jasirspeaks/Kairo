import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// How long a "Schedule Next Meeting" click stays eligible to claim the next
// brand-new calendar event this user creates. Generous enough to cover
// someone picking a time in Google Calendar's UI, tight enough that a
// click from yesterday doesn't grab an unrelated meeting made today.
const SCHEDULE_INTENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Matches Meet/Zoom/Teams/Webex/Meet-alike links pasted into the location
// or description of an event that wasn't created with native Google conferencing.
const MEETING_LINK_PATTERN =
  /https?:\/\/[^\s"<>]*(meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com|webex\.com|whereby\.com|gotomeeting\.com)[^\s"<>]*/i;

function extractMeetingLink(event: any): string | null {
  // 1. Native Google Calendar conferencing data (Meet, or a linked Zoom/Teams add-on).
  const entryPoints = event.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find((e: any) => e.entryPointType === 'video' && e.uri);
    if (video?.uri) return video.uri;
  }

  // 2. Legacy hangoutLink field (still populated on older Meet events).
  if (event.hangoutLink) return event.hangoutLink;

  // 3. Manually pasted links in location or description.
  const haystacks = [event.location, event.description].filter(Boolean);
  for (const text of haystacks) {
    const match = text.match(MEETING_LINK_PATTERN);
    if (match) return match[0];
  }

  return null;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to refresh Google token: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: connection } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: 'No calendar connected' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = connection.access_token;
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;

    // Refresh a minute early to avoid edge-of-expiry failures.
    if (Date.now() > expiresAt - 60_000) {
      if (!connection.refresh_token) {
        return new Response(JSON.stringify({ error: 'Calendar connection expired. Please reconnect.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const refreshed = await refreshAccessToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase.from('calendar_connections').update({
        access_token: accessToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', connection.id);
    }

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // showDeleted so cancelled events come back as status: 'cancelled' rather
    // than just silently disappearing from the feed -- that's how we detect
    // deletions/cancellations and reconcile them against what we've already stored.
    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        showDeleted: 'true',
      }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const eventsData = await eventsRes.json();

    if (!eventsRes.ok) {
      console.error('Google Calendar API error:', eventsData);
      return new Response(JSON.stringify({ error: 'Failed to fetch calendar events' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const events = eventsData.items ?? [];

    // Existing rows for this user within the sync window, so we can tell
    // which stored meetings correspond to events that Google no longer
    // returns as live (i.e. they were deleted/cancelled since last sync).
    const { data: existingRows } = await supabase
      .from('scheduled_meetings')
      .select('id, calendar_event_id, status, cancelled_at')
      .eq('user_id', user.id)
      .gte('start_time', timeMin)
      .lte('start_time', timeMax);

    const existingByEventId = new Map((existingRows ?? []).map((r: any) => [r.calendar_event_id, r]));
    const seenEventIds = new Set<string>();

    // The single most recent live "Schedule Next Meeting" click for this
    // user, if any. At most one brand-new event per sync gets to claim it --
    // first new event wins, then the intent is consumed so a second,
    // unrelated new event on the same sync doesn't also grab it.
    const intentCutoff = new Date(Date.now() - SCHEDULE_INTENT_WINDOW_MS).toISOString();
    let { data: pendingIntent } = await supabase
      .from('pending_schedule_intents')
      .select('id, deal_id')
      .eq('user_id', user.id)
      .gte('created_at', intentCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let synced = 0;
    let skippedNoLink = 0;
    let cancelledCount = 0;
    let removedCount = 0;
    let autoAssigned = 0;

    for (const event of events) {
      if (!event.id) continue;

      const isCancelled = event.status === 'cancelled';
      const existing = existingByEventId.get(event.id);

      if (isCancelled) {
        seenEventIds.add(event.id);
        if (!existing) continue; // We never synced it (e.g. no meeting link) -- nothing to reconcile.

        if (existing.status === 'unassigned') {
          // Never claimed by the user -- safe to remove outright.
          const { error: delError } = await supabase
            .from('scheduled_meetings')
            .delete()
            .eq('id', existing.id);
          if (!delError) removedCount++;
        } else if (!existing.cancelled_at) {
          // Already assigned to a deal (or completed/matched to a call) --
          // keep the row for history and Fireflies matching, just flag it
          // so the Inbox/UI can surface the cancellation instead of silently
          // dropping a meeting the user already linked to a deal.
          const { error: updateError } = await supabase
            .from('scheduled_meetings')
            .update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (!updateError) cancelledCount++;
        }
        continue;
      }

      if (!event.start) continue;

      const meetingLink = extractMeetingLink(event);
      if (!meetingLink) {
        skippedNoLink++;
        // If this event was previously synced (e.g. it had a link before an
        // edit removed it) and hasn't been assigned yet, drop it -- it no
        // longer qualifies as a meeting Kairo should track.
        if (existing && existing.status === 'unassigned') {
          const { error: delError } = await supabase
            .from('scheduled_meetings')
            .delete()
            .eq('id', existing.id);
          if (!delError) removedCount++;
        }
        continue;
      }

      seenEventIds.add(event.id);

      const startTime = event.start.dateTime ?? event.start.date;
      const endTime = event.end?.dateTime ?? event.end?.date ?? null;

      // Brand-new event (never synced before) + a live schedule intent =
      // auto-assign it to the deal the user was scheduling for, instead of
      // leaving it Unassigned in Inbox. Only applies to genuinely new rows;
      // never overwrites an already-assigned meeting's deal_id.
      const isBrandNew = !existing;
      const claimsIntent = isBrandNew && pendingIntent;

      const upsertPayload: Record<string, unknown> = {
        user_id: user.id,
        calendar_event_id: event.id,
        title: event.summary ?? 'Untitled meeting',
        start_time: startTime,
        end_time: endTime,
        attendees: event.attendees ?? null,
        meeting_link: meetingLink,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      };

      if (claimsIntent) {
        upsertPayload.status = 'assigned';
        upsertPayload.deal_id = pendingIntent!.deal_id;
      }

      // Only touches title/time/attendees/link (and status/deal_id when
      // claiming an intent) on conflict -- never overwrites an existing
      // status or deal_id otherwise, so an already-assigned meeting stays
      // assigned even after re-syncing.
      const { error: upsertError } = await supabase.from('scheduled_meetings').upsert(
        upsertPayload,
        { onConflict: 'user_id,calendar_event_id' }
      );

      if (upsertError) {
        console.error('scheduled_meetings upsert error:', upsertError);
        continue;
      }
      synced++;

      if (claimsIntent) {
        // Consume the intent immediately so it can't also claim a second
        // new event later in this same sync pass.
        await supabase.from('pending_schedule_intents').delete().eq('id', pendingIntent!.id);
        autoAssigned++;
        pendingIntent = null;
      }
    }

    // Events that fell outside the sync window entirely (e.g. the meeting
    // was deleted and Google stopped returning it even with showDeleted,
    // which happens once its cancellation drops out of the sync horizon).
    // Reconcile the same way as an explicit 'cancelled' status above.
    for (const row of existingRows ?? []) {
      if (seenEventIds.has(row.calendar_event_id)) continue;

      if (row.status === 'unassigned') {
        const { error: delError } = await supabase
          .from('scheduled_meetings')
          .delete()
          .eq('id', row.id);
        if (!delError) removedCount++;
      } else if (!row.cancelled_at) {
        const { error: updateError } = await supabase
          .from('scheduled_meetings')
          .update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (!updateError) cancelledCount++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      synced,
      skipped_no_link: skippedNoLink,
      cancelled: cancelledCount,
      removed: removedCount,
      auto_assigned: autoAssigned,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-calendar-sync error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
