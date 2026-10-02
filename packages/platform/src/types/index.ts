export type PlatformType = 'web' | 'desktop' | 'ios' | 'android';

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'denied'
  | 'error';

export interface AudioRecordingResult {
  blob?: Blob;
  uri?: string;
  mimeType: string;
  durationMs?: number;
}

export interface UseAudioRecorderResult {
  status: RecorderStatus;
  elapsedMs: number;
  levels: number[];
  errorMessage: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<{ blob: Blob; mimeType: string } | null>;
  discard: () => void;
}

export type NativeCaptureStatus =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'discarded';

export interface NativeCaptureState {
  status: NativeCaptureStatus;
  meeting_id: string | null;
  deal_id: string | null;
  elapsed_seconds: number;
  file_path: string | null;
  error_message: string | null;
}

export interface NativeCaptureCapabilities {
  microphone_supported: boolean;
  system_audio_supported: boolean;
  available_devices: string[];
  default_device_name?: string | null;
  target_sample_rate: number;
  target_channels: number;
}

export interface NativeCaptureResult {
  meeting_id: string;
  deal_id: string | null;
  file_path: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  file_size_bytes: number;
}

export interface UseMeetingCaptureResult {
  isCapturing: boolean;
  isPaused: boolean;
  captureStatus: NativeCaptureStatus;
  elapsedMs: number;
  activeMeetingId: string | null;
  activeDealId: string | null;
  levels: number[];
  errorMessage: string | null;
  startCapture: (meetingId: string, dealId?: string | null) => Promise<void>;
  pauseCapture: () => Promise<void>;
  resumeCapture: () => Promise<void>;
  stopCapture: () => Promise<{ blob?: Blob; filePath?: string; mimeType: string; durationSeconds: number } | null>;
  discardCapture: () => Promise<void>;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface OpenUrlOptions {
  target?: '_blank' | '_self';
  openExternal?: boolean;
}

