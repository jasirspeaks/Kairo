import { describe, it, expect } from 'vitest';
import {
  Meeting,
  MeetingWithDeal,
  MeetingStatus,
  CaptureStatus,
  MeetingSource,
} from '../src';

describe('Domain Meeting Model & Lifecycle', () => {
  const sampleMeeting: Meeting = {
    id: 'meeting-123',
    user_id: 'user-abc',
    calendar_event_id: 'gcal-evt-456',
    title: 'Discovery Call: Acme Corp & Kairo',
    start_time: '2026-10-05T14:00:00Z',
    end_time: '2026-10-05T14:45:00Z',
    attendees: [
      { email: 'ae@seller.com', organizer: true, responseStatus: 'accepted' },
      { email: 'buyer@acme.com', name: 'Jane Doe', responseStatus: 'accepted' },
    ],
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    source: 'kairo_native',
    status: 'assigned',
    capture_status: 'idle',
    deal_id: 'deal-999',
    conversation_id: null,
    matched_conversation_id: null,
    audio_storage_path: null,
    capture_device_info: { os: 'windows', engine: 'wasapi_dual_channel' },
    cancelled_at: null,
    created_at: '2026-10-03T00:00:00Z',
    updated_at: '2026-10-03T00:00:00Z',
  };

  it('correctly models a native Kairo-created scheduled meeting', () => {
    expect(sampleMeeting.source).toBe('kairo_native');
    expect(sampleMeeting.status).toBe('assigned');
    expect(sampleMeeting.deal_id).toBe('deal-999');
    expect(sampleMeeting.attendees).toHaveLength(2);
    expect(sampleMeeting.meeting_link).toContain('meet.google.com');
  });

  it('supports capture state transitions through meeting lifecycle', () => {
    const states: CaptureStatus[] = [
      'idle',
      'approaching',
      'recording',
      'uploading',
      'processing',
      'completed',
    ];

    let currentMeeting: Meeting = { ...sampleMeeting };
    for (const st of states) {
      currentMeeting = { ...currentMeeting, capture_status: st };
      expect(currentMeeting.capture_status).toBe(st);
    }

    expect(currentMeeting.capture_status).toBe('completed');
  });

  it('binds conversation_id upon completed ingestion review', () => {
    const conversationId = 'conv-777';
    const ingestedMeeting: Meeting = {
      ...sampleMeeting,
      conversation_id: conversationId,
      matched_conversation_id: conversationId,
      status: 'completed',
      capture_status: 'completed',
      audio_storage_path: 'user-abc/meeting-123_1727913600.wav',
    };

    expect(ingestedMeeting.conversation_id).toBe(conversationId);
    expect(ingestedMeeting.status).toBe('completed');
    expect(ingestedMeeting.audio_storage_path).toBeTruthy();
  });

  it('correctly augments Meeting with Deal context', () => {
    const meetingWithDeal: MeetingWithDeal = {
      ...sampleMeeting,
      deal_name: 'Acme Enterprise Expansion',
      company_name: 'Acme Corp',
    };

    expect(meetingWithDeal.deal_name).toBe('Acme Enterprise Expansion');
    expect(meetingWithDeal.company_name).toBe('Acme Corp');
    expect(meetingWithDeal.id).toBe(sampleMeeting.id);
  });
});
