import { ScheduledMeeting } from '@kairo/core';
import { getClientConfig, getKairoClient, KairoClient } from '../client';
import { MeetingWithDeal } from './meetings';

export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';

export interface CalendarStatus {
  connected: boolean;
  hasWriteAccess: boolean;
  needsReconnect: boolean;
}

export interface ScheduleMeetingInput {
  deal_id: string;
  title?: string;
  start_time: string; // ISO 8601
  end_time?: string;   // ISO 8601
  attendees?: string[] | Array<{ email: string; name?: string }>;
  description?: string;
  create_meet?: boolean;
}

export async function checkCalendarConnected(
  _userId?: string,
  client: KairoClient = getKairoClient()
): Promise<boolean> {
  const { data, error } = await client.rpc('get_calendar_connection_status');
  if (error || !data) return false;
  return Array.isArray(data) ? data.length > 0 : !!data;
}

export async function getCalendarConnectionStatus(
  _userId?: string,
  client: KairoClient = getKairoClient()
): Promise<CalendarStatus> {
  const { data, error } = await client.rpc('get_calendar_connection_status');

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return { connected: false, hasWriteAccess: false, needsReconnect: false };
  }

  const row = data[0] as {
    connected?: boolean;
    has_write_access?: boolean;
    needs_reconnect?: boolean;
  };

  return {
    connected: Boolean(row.connected),
    hasWriteAccess: Boolean(row.has_write_access),
    needsReconnect: Boolean(row.needs_reconnect),
  };
}

export async function syncGoogleCalendar(
  client: KairoClient = getKairoClient()
): Promise<void> {
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    const { supabaseUrl, supabaseAnonKey } = getClientConfig();
    await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Sync failures shouldn't block rendering
  }
}

export async function scheduleMeetingViaGoogle(
  input: ScheduleMeetingInput,
  client: KairoClient = getKairoClient()
): Promise<MeetingWithDeal> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to schedule a meeting.');
  }

  const { supabaseUrl, supabaseAnonKey } = getClientConfig();

  const response = await fetch(`${supabaseUrl}/functions/v1/schedule-meeting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  const result = await response.json();

  if (!response.ok) {
    const err: any = new Error(result.message || result.error || 'Failed to schedule meeting.');
    err.code = result.error;
    throw err;
  }

  return result.meeting as MeetingWithDeal;
}

export async function getScheduledMeetings(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<(ScheduledMeeting & { deal_name?: string })[]> {
  const { data, error } = await client
    .from('meetings')
    .select('*, deals(deal_name)')
    .eq('user_id', userId)
    .eq('status', 'unassigned')
    .is('cancelled_at', null)
    .order('start_time', { ascending: true })
    .limit(10);

  if (error) throw error;

  return (data || []).map((m: any) => ({
    ...m,
    deal_name: m.deals?.deal_name,
  }));
}

export async function recordPendingScheduleIntent(
  userId: string,
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  const { error } = await client
    .from('pending_schedule_intents')
    .insert({ user_id: userId, deal_id: dealId });
  if (error) throw error;
}
