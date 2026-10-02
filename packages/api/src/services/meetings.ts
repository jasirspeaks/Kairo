import { Meeting, MeetingStatus, CaptureStatus } from '@kairo/core';
import { getKairoClient, KairoClient } from '../client';

export interface MeetingWithDeal extends Meeting {
  deal_name?: string;
  company_name?: string;
}

export interface GetMeetingsOptions {
  dealId?: string;
  status?: MeetingStatus | MeetingStatus[];
  captureStatus?: CaptureStatus | CaptureStatus[];
  upcomingOnly?: boolean;
  limit?: number;
}

export async function getMeetings(
  userId: string,
  options: GetMeetingsOptions = {},
  client: KairoClient = getKairoClient()
): Promise<MeetingWithDeal[]> {
  let query = client
    .from('meetings')
    .select('*, deals(deal_name, company_name)')
    .eq('user_id', userId)
    .is('cancelled_at', null);

  if (options.dealId) {
    query = query.eq('deal_id', options.dealId);
  }

  if (options.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status);
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options.captureStatus) {
    if (Array.isArray(options.captureStatus)) {
      query = query.in('capture_status', options.captureStatus);
    } else {
      query = query.eq('capture_status', options.captureStatus);
    }
  }

  if (options.upcomingOnly) {
    query = query.gte('start_time', new Date().toISOString());
  }

  query = query.order('start_time', { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((m: any) => ({
    ...m,
    deal_name: m.deals?.deal_name,
    company_name: m.deals?.company_name,
  }));
}

export async function getMeeting(
  meetingId: string,
  client: KairoClient = getKairoClient()
): Promise<MeetingWithDeal | null> {
  const { data, error } = await client
    .from('meetings')
    .select('*, deals(deal_name, company_name)')
    .eq('id', meetingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    deal_name: data.deals?.deal_name,
    company_name: data.deals?.company_name,
  } as MeetingWithDeal;
}

export async function getDealMeetings(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<Meeting[]> {
  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('deal_id', dealId)
    .is('cancelled_at', null)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data as Meeting[]) || [];
}

export async function getUpcomingDealMeeting(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<Meeting | null> {
  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('deal_id', dealId)
    .in('status', ['assigned', 'scheduled'])
    .is('cancelled_at', null)
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as Meeting | null;
}

export async function createMeeting(
  meeting: Partial<Meeting> & { user_id: string; title: string },
  client: KairoClient = getKairoClient()
): Promise<Meeting> {
  const { data, error } = await client
    .from('meetings')
    .insert(meeting)
    .select()
    .single();

  if (error) throw error;
  return data as Meeting;
}

export async function updateMeeting(
  meetingId: string,
  updates: Partial<Meeting>,
  client: KairoClient = getKairoClient()
): Promise<Meeting> {
  const { data, error } = await client
    .from('meetings')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw error;
  return data as Meeting;
}

export async function updateMeetingCaptureStatus(
  meetingId: string,
  captureStatus: CaptureStatus,
  extraUpdates: Partial<Meeting> = {},
  client: KairoClient = getKairoClient()
): Promise<Meeting> {
  return updateMeeting(
    meetingId,
    {
      capture_status: captureStatus,
      ...extraUpdates,
    },
    client
  );
}

export async function assignMeetingToDeal(
  meetingId: string,
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<Meeting> {
  return updateMeeting(
    meetingId,
    {
      deal_id: dealId,
      status: 'assigned',
    },
    client
  );
}

export async function linkMeetingConversation(
  meetingId: string,
  conversationId: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  await updateMeeting(
    meetingId,
    {
      conversation_id: conversationId,
      matched_conversation_id: conversationId,
      status: 'completed',
      capture_status: 'completed',
    },
    client
  );

  await client
    .from('conversations')
    .update({ meeting_id: meetingId })
    .eq('id', conversationId);
}

export async function deleteMeeting(
  meetingId: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  const { error } = await client
    .from('meetings')
    .delete()
    .eq('id', meetingId);

  if (error) throw error;
}
