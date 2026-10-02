import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  'SUPABASE_SERVICE_ROLE_KEY'
);
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get(
  'GOOGLE_CLIENT_SECRET'
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SCHEDULE_INTENT_WINDOW_MS =
  30 * 60 * 1000;

const MEETING_LINK_PATTERN =
  /https?:\/\/[^\s"<>]*(meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com|webex\.com|whereby\.com|gotomeeting\.com)[^\s"<>]*/i;

function extractMeetingLink(event: any): string | null {
  const entryPoints =
    event.conferenceData?.entryPoints;

  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find(
      (e: any) =>
        e.entryPointType === 'video' &&
        e.uri
    );

    if (video?.uri) return video.uri;
  }

  if (event.hangoutLink) {
    return event.hangoutLink;
  }

  const haystacks = [
    event.location,
    event.description,
  ].filter(Boolean);

  for (const text of haystacks) {
    const match = text.match(
      MEETING_LINK_PATTERN
    );

    if (match) return match[0];
  }

  return null;
}

async function refreshAccessToken(
  refreshToken: string
) {
  const res = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Failed to refresh Google token: ${JSON.stringify(data)}`
    );
  }

  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const authHeader =
      req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    const token = authHeader.replace(
      /^Bearer\s+/i,
      ''
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    const {
      data: connection,
    } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (!connection) {
      return new Response(
        JSON.stringify({
          error: 'No calendar connected',
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    let accessToken =
      connection.access_token;

    const expiresAt =
      connection.token_expires_at
        ? new Date(
            connection.token_expires_at
          ).getTime()
        : 0;

    // Refresh one minute before expiry.
    if (Date.now() > expiresAt - 60_000) {
      if (!connection.refresh_token) {
        return new Response(
          JSON.stringify({
            error:
              'Calendar connection expired. Please reconnect.',
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              'Content-Type':
                'application/json',
            },
          }
        );
      }

      const refreshed =
        await refreshAccessToken(
          connection.refresh_token
        );

      accessToken =
        refreshed.access_token;

      const newExpiresAt =
        new Date(
          Date.now() +
            refreshed.expires_in * 1000
        ).toISOString();

      await supabase
        .from('calendar_connections')
        .update({
          access_token:
            accessToken,
          token_expires_at:
            newExpiresAt,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          connection.id
        );
    }

    const timeMin =
      new Date().toISOString();

    const timeMax =
      new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000
      ).toISOString();

    const events: any[] = [];
    let nextPageToken:
      | string
      | undefined;

    do {
      const params =
        new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
          showDeleted: 'true',
        });

      if (nextPageToken) {
        params.set(
          'pageToken',
          nextPageToken
        );
      }

      const eventsRes =
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const eventsData =
        await eventsRes.json();

      if (!eventsRes.ok) {
        console.error(
          'Google Calendar API error:',
          eventsData?.error?.message ||
            'Unknown error'
        );

        return new Response(
          JSON.stringify({
            error:
              'Failed to fetch calendar events',
          }),
          {
            status: 502,
            headers: {
              ...corsHeaders,
              'Content-Type':
                'application/json',
            },
          }
        );
      }

      events.push(
        ...(eventsData.items ?? [])
      );

      nextPageToken =
        eventsData.nextPageToken;
    } while (nextPageToken);

    const {
      data: existingRows,
    } = await supabase
      .from('meetings')
      .select(
        'id, calendar_event_id, status, deal_id, source'
      )
      .eq('user_id', user.id)
      .gte(
        'start_time',
        timeMin
      )
      .lte(
        'start_time',
        timeMax
      );

    const existingByEventId =
      new Map(
        (existingRows ?? []).map(
          (r: any) => [
            r.calendar_event_id,
            r,
          ]
        )
      );

    const existingById =
      new Map(
        (existingRows ?? []).map(
          (r: any) => [
            r.id,
            r,
          ]
        )
      );

    const intentCutoff =
      new Date(
        Date.now() -
          SCHEDULE_INTENT_WINDOW_MS
      ).toISOString();

    let {
      data: pendingIntent,
    } = await supabase
      .from('pending_schedule_intents')
      .select('id, deal_id')
      .eq(
        'user_id',
        user.id
      )
      .gte(
        'created_at',
        intentCutoff
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    let synced = 0;
    let skippedNoLink = 0;
    let cancelledCount = 0;
    let removedCount = 0;
    let autoAssigned = 0;

    for (const event of events) {
      if (!event.id) continue;

      const kairoMeetingId =
        event.extendedProperties?.private?.kairo_meeting_id;
      const kairoDealId =
        event.extendedProperties?.private?.kairo_deal_id;

      const isCancelled =
        event.status ===
        'cancelled';

      const existing =
        (kairoMeetingId ? existingById.get(kairoMeetingId) : undefined) ??
        existingByEventId.get(event.id);

      if (isCancelled) {
        if (!existing) {
          continue;
        }

        if (
          existing.status ===
          'unassigned'
        ) {
          const {
            error: delError,
          } = await supabase
            .from(
              'meetings'
            )
            .delete()
            .eq(
              'id',
              existing.id
            );

          if (!delError) {
            removedCount++;
          }
        } else {
          const {
            data: row,
          } = await supabase
            .from(
              'meetings'
            )
            .select(
              'cancelled_at'
            )
            .eq(
              'id',
              existing.id
            )
            .maybeSingle();

          if (!row?.cancelled_at) {
            const {
              error:
                updateError,
            } = await supabase
              .from(
                'meetings'
              )
              .update({
                cancelled_at:
                  new Date().toISOString(),
                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                'id',
                existing.id
              );

            if (!updateError) {
              cancelledCount++;
            }
          }
        }

        continue;
      }

      if (!event.start) {
        continue;
      }

      const meetingLink =
        extractMeetingLink(
          event
        );

      if (!meetingLink) {
        skippedNoLink++;

        if (
          existing &&
          existing.status ===
            'unassigned'
        ) {
          const {
            error: delError,
          } = await supabase
            .from(
              'meetings'
            )
            .delete()
            .eq(
              'id',
              existing.id
            );

          if (!delError) {
            removedCount++;
          }
        }

        continue;
      }

      const startTime =
        event.start.dateTime ??
        event.start.date;

      const endTime =
        event.end?.dateTime ??
        event.end?.date ??
        null;

      // Deterministic Kairo-managed meeting path
      if (kairoMeetingId && existing) {
        const { error: updateError } = await supabase
          .from('meetings')
          .update({
            calendar_event_id: event.id,
            title: event.summary ?? existing.title ?? 'Untitled meeting',
            start_time: startTime,
            end_time: endTime,
            attendees: event.attendees ?? null,
            meeting_link: meetingLink,
            cancelled_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!updateError) {
          synced++;
        }
        continue;
      }

      const isBrandNew =
        !existing;

      const claimsIntent =
        isBrandNew &&
        !!pendingIntent;

      const upsertPayload:
        Record<string, unknown> =
        {
          user_id:
            user.id,
          calendar_event_id:
            event.id,
          title:
            event.summary ??
            'Untitled meeting',
          start_time:
            startTime,
          end_time:
            endTime,
          attendees:
            event.attendees ??
            null,
          meeting_link:
            meetingLink,
          source:
            kairoMeetingId ? 'kairo_native' : 'google_calendar',
          cancelled_at:
            null,
          updated_at:
            new Date().toISOString(),
        };

      if (kairoMeetingId) {
        upsertPayload.id = kairoMeetingId;
        upsertPayload.status = 'scheduled';
        if (kairoDealId) {
          const { data: validDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('id', kairoDealId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (validDeal) {
            upsertPayload.deal_id = kairoDealId;
          }
        }
      } else if (claimsIntent) {
        upsertPayload.status =
          'assigned';

        upsertPayload.deal_id =
          pendingIntent!.deal_id;
      }

      const {
        error: upsertError,
      } = await supabase
        .from(
          'meetings'
        )
        .upsert(
          upsertPayload,
          {
            onConflict:
              'user_id,calendar_event_id',
          }
        );

      if (upsertError) {
        console.error(
          'meetings upsert error:',
          upsertError.message
        );

        continue;
      }

      synced++;

      if (claimsIntent) {
        await supabase
          .from(
            'pending_schedule_intents'
          )
          .delete()
          .eq(
            'id',
            pendingIntent!.id
          );

        autoAssigned++;
        pendingIntent = null;
      }
    }

    // IMPORTANT:
    //
    // Do NOT reconcile "unseen" database rows as cancelled here.
    //
    // This query is intentionally bounded to the next seven days. A meeting
    // can legitimately be rescheduled outside that window and disappear from
    // this API response without being cancelled.
    //
    // Explicit Google event.status === 'cancelled' events above are still
    // reconciled normally.

    return new Response(
      JSON.stringify({
        ok: true,
        synced,
        skipped_no_link:
          skippedNoLink,
        cancelled:
          cancelledCount,
        removed:
          removedCount,
        auto_assigned:
          autoAssigned,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type':
            'application/json',
        },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Internal server error';

    console.error(
      'google-calendar-sync error:',
      message
    );

    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type':
            'application/json',
        },
      }
    );
  }
});