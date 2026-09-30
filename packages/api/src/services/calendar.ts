import { ScheduledMeeting } from '@kairo/core';
import { getClientConfig, getKairoClient, KairoClient } from '../client';

export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';

export async function checkCalendarConnected(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<boolean> {
  const { data } = await client
    .from('calendar_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  return !!data;
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

export async function getScheduledMeetings(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<(ScheduledMeeting & { deal_name?: string })[]> {
  const { data, error } = await client
    .from('scheduled_meetings')
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
