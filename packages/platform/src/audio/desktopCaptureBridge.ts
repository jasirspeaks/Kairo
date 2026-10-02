import { NativeCaptureState, NativeCaptureResult } from '../types';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export async function startNativeMeetingCapture(
  meetingId: string,
  dealId?: string | null
): Promise<NativeCaptureState> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NativeCaptureState>('start_meeting_capture', {
        meetingId,
        dealId: dealId || null,
      });
    } catch (e: any) {
      console.error('[DesktopBridge] Failed to invoke start_meeting_capture:', e);
      throw new Error(e?.message || 'Failed to start desktop audio capture');
    }
  }

  // Web fallback simulation
  return {
    status: 'recording',
    meeting_id: meetingId,
    deal_id: dealId || null,
    elapsed_seconds: 0,
    file_path: null,
    error_message: null,
  };
}

export async function pauseNativeMeetingCapture(): Promise<void> {
  if (isTauriEnvironment()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('pause_meeting_capture');
  }
}

export async function resumeNativeMeetingCapture(): Promise<void> {
  if (isTauriEnvironment()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('resume_meeting_capture');
  }
}

export async function stopNativeMeetingCapture(): Promise<NativeCaptureResult> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NativeCaptureResult>('stop_meeting_capture');
    } catch (e: any) {
      console.error('[DesktopBridge] Failed to invoke stop_meeting_capture:', e);
      throw new Error(e?.message || 'Failed to stop desktop audio capture');
    }
  }

  return {
    meeting_id: '',
    deal_id: null,
    file_path: '',
    duration_seconds: 0,
    sample_rate: 16000,
    channels: 1,
    file_size_bytes: 0,
  };
}

export async function discardNativeMeetingCapture(): Promise<void> {
  if (isTauriEnvironment()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('discard_meeting_capture');
  }
}

export async function getNativeCaptureStatus(): Promise<NativeCaptureState> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NativeCaptureState>('get_capture_status');
    } catch (e) {
      return {
        status: 'idle',
        meeting_id: null,
        deal_id: null,
        elapsed_seconds: 0,
        file_path: null,
        error_message: null,
      };
    }
  }

  return {
    status: 'idle',
    meeting_id: null,
    deal_id: null,
    elapsed_seconds: 0,
    file_path: null,
    error_message: null,
  };
}
