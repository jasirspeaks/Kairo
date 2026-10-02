import { useState, useEffect, useCallback, useRef } from 'react';
import { MeetingWithDeal } from '@kairo/core';
import { getMeetings, updateMeetingCaptureStatus, submitRecording } from '@kairo/api';
import { useMeetingCapture } from '@kairo/platform';

interface UseMeetingWatcherOptions {
  userId: string | undefined;
  checkIntervalMs?: number;
  autoCaptureEnabled?: boolean;
}

export function useMeetingWatcher({
  userId,
  checkIntervalMs = 20000,
  autoCaptureEnabled = true,
}: UseMeetingWatcherOptions) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingWithDeal[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<MeetingWithDeal | null>(null);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState<string>('idle');
  const [lastProcessedMeetingId, setLastProcessedMeetingId] = useState<string | null>(null);

  const capture = useMeetingCapture();
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const fetchUpcoming = useCallback(async () => {
    if (!userId) return;
    try {
      const meetings = await getMeetings(userId, {
        upcomingOnly: true,
        limit: 5,
      });
      setUpcomingMeetings(meetings);

      // Check if there is an active/approaching meeting right now
      const now = Date.now();
      const activeOrApproaching = meetings.find((m) => {
        if (!m.start_time) return false;
        const start = new Date(m.start_time).getTime();
        const end = m.end_time ? new Date(m.end_time).getTime() : start + 30 * 60 * 1000;
        // Approaching within 3 minutes or currently in progress
        return (start - 3 * 60 * 1000 <= now && now <= end) && m.capture_status !== 'completed';
      });

      if (activeOrApproaching) {
        setCurrentMeeting(activeOrApproaching);

        // Auto-start capture if meeting has begun and we haven't already started
        const start = new Date(activeOrApproaching.start_time!).getTime();
        if (
          autoCaptureEnabled &&
          now >= start - 60 * 1000 &&
          !captureRef.current.isCapturing &&
          activeOrApproaching.capture_status !== 'completed' &&
          lastProcessedMeetingId !== activeOrApproaching.id
        ) {
          setIsAutoCapturing(true);
          await captureRef.current.startCapture(activeOrApproaching.id, activeOrApproaching.deal_id);
          await updateMeetingCaptureStatus(activeOrApproaching.id, 'recording');
        }
      }
    } catch (err) {
      console.error('[MeetingWatcher] Failed to fetch upcoming meetings', err);
    }
  }, [userId, autoCaptureEnabled, lastProcessedMeetingId]);

  useEffect(() => {
    fetchUpcoming();
    const interval = setInterval(fetchUpcoming, checkIntervalMs);
    return () => clearInterval(interval);
  }, [fetchUpcoming, checkIntervalMs]);

  const handleStopAndProcess = async () => {
    if (!currentMeeting) return;
    setIngestionStatus('uploading');

    try {
      const res = await capture.stopCapture();
      if (!res) {
        setIngestionStatus('failed');
        return;
      }

      setIngestionStatus('processing');
      await updateMeetingCaptureStatus(currentMeeting.id, 'processing');

      if (res.blob && currentMeeting.deal_id) {
        await submitRecording(currentMeeting.deal_id, res.blob, res.mimeType, currentMeeting.id);
      }

      await updateMeetingCaptureStatus(currentMeeting.id, 'completed');
      setLastProcessedMeetingId(currentMeeting.id);
      setIngestionStatus('completed');
      setCurrentMeeting(null);
      await fetchUpcoming();
    } catch (err) {
      console.error('[MeetingWatcher] Failed to process meeting capture', err);
      setIngestionStatus('failed');
      if (currentMeeting) {
        await updateMeetingCaptureStatus(currentMeeting.id, 'failed');
      }
    }
  };

  const handleDiscard = async () => {
    await capture.discardCapture();
    if (currentMeeting) {
      await updateMeetingCaptureStatus(currentMeeting.id, 'discarded');
      setCurrentMeeting(null);
    }
    setIngestionStatus('idle');
  };

  return {
    upcomingMeetings,
    currentMeeting,
    isCapturing: capture.isCapturing,
    isPaused: capture.isPaused,
    captureStatus: ingestionStatus !== 'idle' ? ingestionStatus : capture.captureStatus,
    elapsedMs: capture.elapsedMs,
    pauseCapture: capture.pauseCapture,
    resumeCapture: capture.resumeCapture,
    stopCapture: handleStopAndProcess,
    discardCapture: handleDiscard,
    manualStartCapture: async (meeting: MeetingWithDeal) => {
      setCurrentMeeting(meeting);
      await capture.startCapture(meeting.id, meeting.deal_id);
      await updateMeetingCaptureStatus(meeting.id, 'recording');
    },
    refreshUpcoming: fetchUpcoming,
  };
}
