import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MEETING_LINK_PATTERN =
  /https?:\/\/[^\s"<>]*(meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com|webex\.com|whereby\.com|gotomeeting\.com)[^\s"<>]*/i;

function extractMeetingLink(event: any): string | null {
  const entryPoints = event.conferenceData?.entryPoints;

  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find(
      (e: any) => e.entryPointType === 'video' && e.uri
    );
    if (video?.uri) return video.uri;
  }

  if (event.hangoutLink) {
    return event.hangoutLink;
  }

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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Failed to refresh Google token: ${JSON.stringify(data)}`
    );
  }

  return data;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server misconfiguration' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Verify user has write access (active subscription or valid trial)
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('status, trial_end')
      .eq('user_id', user.id)
      .maybeSingle();

    const hasWriteAccess =
      !subError &&
      subscription &&
      (subscription.status === 'active' ||
        (subscription.status === 'trialing' &&
          new Date(subscription.trial_end).getTime() > Date.now()));

    if (!hasWriteAccess) {
      return json(
        {
          error: 'ACCESS_RESTRICTED',
          message:
            'Active subscription or trial is required to schedule meetings.',
        },
        403
      );
    }

    const body = await req.json();
    const {
      deal_id,
      title,
      start_time,
      end_time,
      attendees,
      description,
      create_meet = true,
    } = body;

    if (!deal_id) {
      return json({ error: 'deal_id is required' }, 400);
    }

    if (!start_time) {
      return json({ error: 'start_time is required (ISO 8601 string)' }, 400);
    }

    // Verify Deal ownership
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, deal_name, company_name, user_id')
      .eq('id', deal_id)
      .eq('user_id', user.id)
      .single();

    if (dealError || !deal) {
      return json({ error: 'Deal not found' }, 404);
    }

    // Fetch Google Calendar connection
    const { data: connection, error: connError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .maybeSingle();

    if (connError || !connection) {
      return json(
        {
          error: 'NO_CALENDAR_CONNECTED',
          message:
            'Google Calendar is not connected. Please connect your calendar in Settings.',
        },
        404
      );
    }

    // Verify write scope
    const grantedScope = connection.scope || '';
    const hasWriteScope =
      grantedScope.includes('calendar.events') ||
      grantedScope.includes('https://www.googleapis.com/auth/calendar') &&
        !grantedScope.includes('calendar.readonly');

    if (!hasWriteScope) {
      await supabase
        .from('calendar_connections')
        .update({ needs_reconnect: true, updated_at: new Date().toISOString() })
        .eq('id', connection.id);

      return json(
        {
          error: 'SCOPE_UPGRADE_REQUIRED',
          message:
            'Google Calendar write access is required to schedule meetings. Please re-authorize calendar access.',
        },
        403
      );
    }

    let accessToken = connection.access_token;
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;

    // Refresh token if near expiry (within 60s)
    if (Date.now() > expiresAt - 60_000) {
      if (!connection.refresh_token) {
        return json(
          {
            error: 'AUTH_EXPIRED',
            message: 'Calendar credentials expired. Please reconnect Google Calendar.',
          },
          401
        );
      }

      const refreshed = await refreshAccessToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString();

      await supabase
        .from('calendar_connections')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
    }

    // Generate Kairo meeting UUID
    const meetingId = crypto.randomUUID();
    const meetingTitle =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : `${deal.deal_name} · ${deal.company_name}`;

    // Normalize attendees
    let normalizedAttendees: Array<{ email: string; displayName?: string }> = [];
    if (Array.isArray(attendees)) {
      normalizedAttendees = attendees
        .map((a: any) => {
          if (typeof a === 'string') return { email: a.trim() };
          if (typeof a === 'object' && a?.email) {
            return {
              email: String(a.email).trim(),
              displayName: a.name ? String(a.name).trim() : undefined,
            };
          }
          return null;
        })
        .filter((a): a is { email: string; displayName?: string } => !!a && a.email.length > 3);
    }

    const startDateTime = new Date(start_time).toISOString();
    const endDateTime = end_time
      ? new Date(end_time).toISOString()
      : new Date(new Date(start_time).getTime() + 30 * 60 * 1000).toISOString();

    // Prepare Google Calendar event payload
    const eventPayload: Record<string, unknown> = {
      summary: meetingTitle,
      description:
        description ||
        `Kairo Deal Intelligence Meeting for ${deal.deal_name} (${deal.company_name})`,
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
      attendees: normalizedAttendees,
      extendedProperties: {
        private: {
          kairo_meeting_id: meetingId,
          kairo_deal_id: deal.id,
          kairo_managed: 'true',
        },
      },
    };

    if (create_meet) {
      eventPayload.conferenceData = {
        createRequest: {
          requestId: `kairo-meet-${meetingId}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    // Create event via Google Calendar API
    const googleCalendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`;
    const googleRes = await fetch(googleCalendarUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    const eventData = await googleRes.json();

    if (!googleRes.ok) {
      console.error('Google Calendar event creation failed:', eventData);
      return json(
        {
          error: 'GOOGLE_API_ERROR',
          message:
            eventData?.error?.message ||
            'Failed to create event in Google Calendar.',
        },
        502
      );
    }

    const meetingLink = extractMeetingLink(eventData);

    // Persist deterministic meeting in Kairo
    const { data: newMeeting, error: insertError } = await supabase
      .from('meetings')
      .insert({
        id: meetingId,
        user_id: user.id,
        deal_id: deal.id,
        calendar_event_id: eventData.id,
        title: meetingTitle,
        start_time: startDateTime,
        end_time: endDateTime,
        attendees: eventData.attendees || normalizedAttendees,
        meeting_link: meetingLink,
        source: 'kairo_native',
        status: 'scheduled',
        capture_status: 'idle',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert meeting row:', insertError);
      return json(
        {
          error: 'DATABASE_ERROR',
          message: `Meeting created in Google Calendar (${eventData.id}) but failed to save in Kairo database: ${insertError.message}`,
        },
        500
      );
    }

    return json({
      ok: true,
      meeting: {
        ...newMeeting,
        deal_name: deal.deal_name,
        company_name: deal.company_name,
      },
    });
  } catch (err) {
    console.error('schedule-meeting error:', err);
    return json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      500
    );
  }
});
