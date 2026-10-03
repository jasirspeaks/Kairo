import { useState, useEffect, useRef, useCallback } from 'react';
import { UseMeetingCaptureResult, NativeCaptureStatus } from '../types';
import {
  isTauriEnvironment,
  startNativeMeetingCapture,
  pauseNativeMeetingCapture,
  resumeNativeMeetingCapture,
  stopNativeMeetingCapture,
  discardNativeMeetingCapture,
  getNativeCaptureStatus,
  readNativeCaptureBytes,
} from './desktopCaptureBridge';
import { useAudioRecorder } from './useAudioRecorder';

export function useMeetingCapture(): UseMeetingCaptureResult {
  const [captureStatus, setCaptureStatus] = useState<NativeCaptureStatus>('idle');
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fallbackRecorder = useAudioRecorder();
  const isTauri = isTauriEnvironment();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const pauseStartRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const startCapture = useCallback(async (meetingId: string, dealId?: string | null, captureSource?: import('../types').CaptureSource | null) => {
    setErrorMessage(null);
    setActiveMeetingId(meetingId);
    setActiveDealId(dealId || null);
    pausedAccumulatedMsRef.current = 0;
    pauseStartRef.current = null;
    startTimeRef.current = Date.now();
    setElapsedMs(0);

    if (isTauri) {
      try {
        const state = await startNativeMeetingCapture(meetingId, dealId, captureSource);
        setCaptureStatus(state.status);
      } catch (err: any) {
        setCaptureStatus('failed');
        setErrorMessage(err?.message || 'Failed to start desktop audio capture');
        return;
      }
    } else {
      await fallbackRecorder.start();
      setCaptureStatus('recording');
    }

    clearTimer();
    timerRef.current = setInterval(() => {
      if (pauseStartRef.current === null) {
        const now = Date.now();
        const duration = now - startTimeRef.current - pausedAccumulatedMsRef.current;
        setElapsedMs(Math.max(0, duration));
      }
    }, 200);
  }, [isTauri, fallbackRecorder, clearTimer]);

  const pauseCapture = useCallback(async () => {
    if (isTauri) {
      await pauseNativeMeetingCapture();
    } else {
      fallbackRecorder.pause();
    }
    pauseStartRef.current = Date.now();
    setCaptureStatus('paused');
  }, [isTauri, fallbackRecorder]);

  const resumeCapture = useCallback(async () => {
    if (pauseStartRef.current !== null) {
      pausedAccumulatedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    if (isTauri) {
      await resumeNativeMeetingCapture();
    } else {
      fallbackRecorder.resume();
    }
    setCaptureStatus('recording');
  }, [isTauri, fallbackRecorder]);

  const stopCapture = useCallback(async () => {
    clearTimer();

    if (isTauri) {
      try {
        const result = await stopNativeMeetingCapture();
        let captureBlob: Blob | undefined;
        if (result.file_path) {
          try {
            const rawBytes = await readNativeCaptureBytes(result.file_path);
            captureBlob = rawBytes || undefined;
          } catch (readErr) {
            console.warn('Could not read native capture bytes:', readErr);
          }
        }
        setCaptureStatus('completed');
        return {
          blob: captureBlob || undefined,
          filePath: result.file_path,
          mimeType: 'audio/wav',
          durationSeconds: result.duration_seconds || Math.round(elapsedMs / 1000),
        };
      } catch (err: any) {
        setCaptureStatus('failed');
        setErrorMessage(err?.message || 'Failed to stop capture');
        return null;
      }
    } else {
      const rec = await fallbackRecorder.stop();
      setCaptureStatus('completed');
      if (!rec) return null;
      return {
        blob: rec.blob,
        mimeType: rec.mimeType,
        durationSeconds: Math.round(elapsedMs / 1000),
      };
    }
  }, [isTauri, fallbackRecorder, clearTimer, elapsedMs]);

  const discardCapture = useCallback(async () => {
    clearTimer();
    if (isTauri) {
      await discardNativeMeetingCapture();
    } else {
      fallbackRecorder.discard();
    }
    setCaptureStatus('idle');
    setActiveMeetingId(null);
    setActiveDealId(null);
    setElapsedMs(0);
  }, [isTauri, fallbackRecorder, clearTimer]);

  return {
    isCapturing: captureStatus === 'recording' || captureStatus === 'paused',
    isPaused: captureStatus === 'paused',
    captureStatus,
    elapsedMs: isTauri ? elapsedMs : fallbackRecorder.elapsedMs,
    activeMeetingId,
    activeDealId,
    levels: fallbackRecorder.levels,
    errorMessage: errorMessage || fallbackRecorder.errorMessage,
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
    discardCapture,
  };
}
