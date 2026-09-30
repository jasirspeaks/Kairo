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

export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface OpenUrlOptions {
  target?: '_blank' | '_self';
  openExternal?: boolean;
}
