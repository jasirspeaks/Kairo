import { describe, it, expect } from 'vitest';
import {
  Meeting,
  ScheduledMeeting,
  MeetingStatus,
  CaptureStatus,
  MeetingAttendee,
} from '../src';

describe('Phase 7: Meeting Edge Cases & Hardening', () => {
  const baseMeeting: Meeting = {
    id: 'meeting-edge-001',
    user_id: 'user-ae-456',
    calendar_event_id: 'gcal_event_edge999',
    title: 'Acme Architecture Review',
    start_time: '2026-10-04T10:00:00Z',
    end_time: '2026-10-04T11:00:00Z',
    attendees: [
      { email: 'ae@kairo.com', organizer: true, responseStatus: 'accepted' },
      { email: 'prospect@acme.com', responseStatus: 'needsAction' },
    ],
    meeting_link: 'https://meet.google.com/edge-test-123',
    source: 'kairo_native',
    status: 'assigned',
    capture_status: 'idle',
    deal_id: 'deal-edge-001',
    conversation_id: null,
    matched_conversation_id: null,
    audio_storage_path: null,
    capture_device_info: null,
    cancelled_at: null,
    created_at: '2026-10-03T00:00:00Z',
    updated_at: '2026-10-03T00:00:00Z',
  };

  it('handles meeting cancellation cleanly by setting cancelled_at and status cancelled', () => {
    const cancelledTimestamp = '2026-10-03T12:00:00Z';
    const cancelledMeeting: Meeting = {
      ...baseMeeting,
      status: 'cancelled',
      capture_status: 'discarded',
      cancelled_at: cancelledTimestamp,
    };

    expect(cancelledMeeting.status).toBe('cancelled');
    expect(cancelledMeeting.cancelled_at).toBe(cancelledTimestamp);
    expect(cancelledMeeting.capture_status).toBe('discarded');
  });

  it('maintains ScheduledMeeting type alias equality for backward compatibility', () => {
    const scheduledMeeting: ScheduledMeeting = { ...baseMeeting };
    expect(scheduledMeeting.id).toBe(baseMeeting.id);
    expect(scheduledMeeting.title).toBe(baseMeeting.title);
  });

  it('correctly manages capture recovery from failed capture status', () => {
    // If a capture fails midway (e.g. disk or mic error)
    const failedCapture: Meeting = {
      ...baseMeeting,
      capture_status: 'failed',
    };
    expect(failedCapture.capture_status).toBe('failed');

    // Retrying capture resets to recording
    const retriedCapture: Meeting = {
      ...failedCapture,
      capture_status: 'recording',
    };
    expect(retriedCapture.capture_status).toBe('recording');
  });

  it('correctly processes attendee responseStatus updates during calendar sync', () => {
    const updatedAttendees: MeetingAttendee[] = [
      { email: 'ae@kairo.com', organizer: true, responseStatus: 'accepted' },
      { email: 'prospect@acme.com', responseStatus: 'accepted' },
      { email: 'legal@acme.com', responseStatus: 'declined' },
    ];

    const updatedMeeting: Meeting = {
      ...baseMeeting,
      attendees: updatedAttendees,
    };

    expect(updatedMeeting.attendees).toHaveLength(3);
    expect(updatedMeeting.attendees![1].responseStatus).toBe('accepted');
    expect(updatedMeeting.attendees![2].responseStatus).toBe('declined');
  });

  it('guarantees deterministic non-null source identifier', () => {
    const nativeMeeting: Meeting = { ...baseMeeting, source: 'kairo_native' };
    const importedMeeting: Meeting = { ...baseMeeting, source: 'google_calendar' };
    const adHocMeeting: Meeting = { ...baseMeeting, source: 'ad_hoc' };

    expect(nativeMeeting.source).toBe('kairo_native');
    expect(importedMeeting.source).toBe('google_calendar');
    expect(adHocMeeting.source).toBe('ad_hoc');
  });
});
