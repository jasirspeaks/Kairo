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
  checkIntervalMs = 10000,
  autoCaptureEnabled = true,
}: UseMeetingWatcherOptions) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingWithDeal[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<MeetingWithDeal | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<string>('idle');

  const currentMeetingRef = useRef<MeetingWithDeal | null>(null);
  currentMeetingRef.current = currentMeeting;

  const isProcessingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);

  const capture = useMeetingCapture();
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const handleStopAndProcess = useCallback(async (targetMeeting?: MeetingWithDeal | null) => {
    const meetingToProcess = targetMeeting || currentMeetingRef.current;
    if (!meetingToProcess || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIngestionStatus('uploading');

    try {
      await updateMeetingCaptureStatus(meetingToProcess.id, 'uploading').catch(() => {});
      const res = await captureRef.current.stopCapture();
      if (!res || !res.blob) {
        throw new Error('Capture stopped but no valid audio recording was obtained.');
      }

      setIngestionStatus('processing');
      await updateMeetingCaptureStatus(meetingToProcess.id, 'processing').catch(() => {});

      if (meetingToProcess.deal_id) {
        await submitRecording(
          meetingToProcess.deal_id,
          res.blob,
          res.mimeType || 'audio/wav',
          meetingToProcess.id
        );
      }

      await updateMeetingCaptureStatus(meetingToProcess.id, 'completed', { status: 'completed' }).catch(() => {});
      setIngestionStatus('completed');

      // Refresh meetings
      if (userId) {
        const refreshed = await getMeetings(userId, { activeOrUpcoming: true, limit: 10 }).catch(() => []);
        setUpcomingMeetings(refreshed);
      }

      // Display completion status briefly before resetting bar
      setTimeout(() => {
        setIngestionStatus('idle');
        setCurrentMeeting(null);
        currentMeetingRef.current = null;
        isProcessingRef.current = false;
      }, 5000);
    } catch (err: any) {
      console.error('[MeetingWatcher] Failed to process meeting capture:', err);
      setIngestionStatus('failed');
      if (meetingToProcess) {
        await updateMeetingCaptureStatus(meetingToProcess.id, 'failed').catch(() => {});
      }
      isProcessingRef.current = false;
    }
  }, [userId]);

  const tick = useCallback(async () => {
    if (!userId || isProcessingRef.current) return;

    try {
      const meetings = await getMeetings(userId, {
        activeOrUpcoming: true,
        limit: 10,
      });

      // Filter eligible meetings: not cancelled, not completed, not discarded, must have deal_id
      const eligibleMeetings = meetings.filter((m) => {
        if (!m.start_time || m.cancelled_at || m.status === 'cancelled' || m.status === 'completed') return false;
        if (m.capture_status === 'completed' || m.capture_status === 'discarded') return false;
        return !!m.deal_id;
      });

      setUpcomingMeetings(eligibleMeetings);

      const now = Date.now();

      // 1. If currently capturing, check if meeting has ended
      if (captureRef.current.isCapturing && currentMeetingRef.current) {
        const active = currentMeetingRef.current;
        const start = new Date(active.start_time!).getTime();
        const end = active.end_time ? new Date(active.end_time).getTime() : start + 30 * 60 * 1000;

        if (now >= end) {
          console.log(`[MeetingWatcher] Scheduled end reached for "${active.title}". Auto-stopping capture...`);
          await handleStopAndProcess(active);
          return;
        }
      }

      // 2. If not capturing and not currently starting or processing, check for candidate meetings
      if (!captureRef.current.isCapturing && !isStartingRef.current && !isProcessingRef.current) {
        const candidate = eligibleMeetings.find((m) => {
          const start = new Date(m.start_time!).getTime();
          const end = m.end_time ? new Date(m.end_time).getTime() : start + 30 * 60 * 1000;
          // Approaching within 3 minutes or currently in progress
          return start - 3 * 60 * 1000 <= now && now < end;
        });

        if (candidate) {
          setCurrentMeeting(candidate);
          currentMeetingRef.current = candidate;

          const start = new Date(candidate.start_time!).getTime();
          const end = candidate.end_time ? new Date(candidate.end_time).getTime() : start + 30 * 60 * 1000;

          // Auto-start capture within pre-roll (1 minute before start) or in-flight
          if (
            autoCaptureEnabled &&
            now >= start - 60 * 1000 &&
            now < end &&
            candidate.capture_status !== 'failed' &&
            candidate.capture_status !== 'processing' &&
            candidate.capture_status !== 'uploading'
          ) {
            isStartingRef.current = true;
            try {
              console.log(`[MeetingWatcher] Auto-starting capture for "${candidate.title}"...`);
              await updateMeetingCaptureStatus(candidate.id, 'recording');
              await captureRef.current.startCapture(candidate.id, candidate.deal_id);
              setIngestionStatus('recording');
            } catch (startErr) {
              console.error('[MeetingWatcher] Failed to auto-start capture:', startErr);
              await updateMeetingCaptureStatus(candidate.id, 'failed').catch(() => {});
              setIngestionStatus('failed');
            } finally {
              isStartingRef.current = false;
            }
          } else if (candidate.capture_status === 'idle') {
            await updateMeetingCaptureStatus(candidate.id, 'approaching').catch(() => {});
            setIngestionStatus('approaching');
          }
        }
      }
    } catch (err) {
      console.error('[MeetingWatcher] Polling tick error:', err);
    }
  }, [userId, autoCaptureEnabled, handleStopAndProcess]);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, checkIntervalMs);

    const handleFocus = () => {
      tick();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tick, checkIntervalMs]);

  const handleDiscard = async () => {
    await capture.discardCapture();
    const active = currentMeetingRef.current;
    if (active) {
      await updateMeetingCaptureStatus(active.id, 'discarded').catch(() => {});
      setCurrentMeeting(null);
      currentMeetingRef.current = null;
    }
    setIngestionStatus('idle');
  };

  const effectiveCaptureStatus =
    ingestionStatus !== 'idle'
      ? ingestionStatus
      : capture.captureStatus !== 'idle'
        ? capture.captureStatus
        : currentMeeting?.capture_status || 'idle';

  return {
    upcomingMeetings,
    currentMeeting,
    isCapturing: capture.isCapturing,
    isPaused: capture.isPaused,
    captureStatus: effectiveCaptureStatus,
    elapsedMs: capture.elapsedMs,
    pauseCapture: capture.pauseCapture,
    resumeCapture: capture.resumeCapture,
    stopCapture: () => handleStopAndProcess(currentMeetingRef.current),
    discardCapture: handleDiscard,
    manualStartCapture: async (meeting: MeetingWithDeal) => {
      setCurrentMeeting(meeting);
      currentMeetingRef.current = meeting;
      await updateMeetingCaptureStatus(meeting.id, 'recording');
      await capture.startCapture(meeting.id, meeting.deal_id);
      setIngestionStatus('recording');
    },
    refreshUpcoming: tick,
  };
}
