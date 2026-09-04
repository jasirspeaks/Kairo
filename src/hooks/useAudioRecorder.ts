import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'denied' | 'error';

interface UseAudioRecorderResult {
  status: RecorderStatus;
  elapsedMs: number;
  // Rolling array of 0-1 amplitude samples, newest last -- drives the
  // waveform bars. Fixed length (LEVEL_BAR_COUNT) so consumers can map it
  // straight to a fixed set of bars without their own windowing logic.
  levels: number[];
  errorMessage: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  // Resolves with the recorded blob once MediaRecorder has actually
  // flushed its final chunk -- callers should await this rather than
  // reading state right after calling stop().
  stop: () => Promise<{ blob: Blob; mimeType: string } | null>;
  // Tears down the stream/recorder without producing a blob -- used when
  // the user discards mid-recording rather than submitting.
  discard: () => void;
}

const LEVEL_BAR_COUNT = 32;
const LEVEL_SAMPLE_MS = 80;

// Safari (incl. iOS) doesn't support audio/webm at all and is picky about
// codecs param strings -- probe in priority order and let the browser
// reject ones it can't do. audio/mp4 (AAC) matches guessMimeType's
// .m4a/.aac handling server-side with zero backend changes needed.
const MIME_CANDIDATES = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/aac',
];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(LEVEL_BAR_COUNT).fill(0));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/mp4');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);

  function clearTimers() {
    if (levelIntervalRef.current) { clearInterval(levelIntervalRef.current); levelIntervalRef.current = null; }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
  }

  function teardownStream() {
    clearTimers();
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }

  useEffect(() => () => teardownStream(), []);

  const start = useCallback(async () => {
    setErrorMessage(null);
    setStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus('denied');
      setErrorMessage(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in your browser settings to record a call.'
          : 'Could not access the microphone. Check your device settings and try again.'
      );
      return;
    }

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      stream.getTracks().forEach(t => t.stop());
      setStatus('error');
      setErrorMessage('This browser doesn\u2019t support in-browser recording. Try uploading a recording instead.');
      return;
    }

    streamRef.current = stream;
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      setStatus('error');
      setErrorMessage('Recording stopped unexpectedly. Please try again.');
      teardownStream();
    };
    recorderRef.current = recorder;

    // AnalyserNode off the live stream -- separate from MediaRecorder,
    // purely for the waveform. Recording continues even if this fails.
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      levelIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);
        // RMS amplitude, normalized roughly 0-1 for typical speech levels.
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const centered = (dataArray[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const normalized = Math.min(1, rms * 4);
        setLevels(prev => [...prev.slice(1), normalized]);
      }, LEVEL_SAMPLE_MS);
    } catch {
      // Waveform is cosmetic -- recording proceeds without it.
    }

    recordingStartedAtRef.current = Date.now();
    pausedAccumulatedMsRef.current = 0;
    pausedAtRef.current = null;
    setElapsedMs(0);

    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - recordingStartedAtRef.current - pausedAccumulatedMsRef.current);
    }, 250);

    recorder.start(1000);
    setStatus('recording');
  }, []);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    pausedAtRef.current = Date.now();
    if (levelIntervalRef.current) { clearInterval(levelIntervalRef.current); levelIntervalRef.current = null; }
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    if (pausedAtRef.current) {
      pausedAccumulatedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    recorder.resume();

    const analyser = analyserRef.current;
    if (analyser && !levelIntervalRef.current) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      levelIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const centered = (dataArray[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const normalized = Math.min(1, rms * 4);
        setLevels(prev => [...prev.slice(1), normalized]);
      }, LEVEL_SAMPLE_MS);
    }

    setStatus('recording');
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob; mimeType: string } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = mimeTypeRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        teardownStream();
        setStatus('stopped');
        resolve(blob.size > 0 ? { blob, mimeType } : null);
      };

      recorder.stop();
    });
  }, []);

  const discard = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* already inactive */ }
    }
    teardownStream();
    chunksRef.current = [];
    setElapsedMs(0);
    setLevels(new Array(LEVEL_BAR_COUNT).fill(0));
    setStatus('idle');
  }, []);

  return { status, elapsedMs, levels, errorMessage, start, pause, resume, stop, discard };
}