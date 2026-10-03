import { NativeCaptureState, NativeCaptureResult, NativeCaptureCapabilities } from '../types';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export async function getNativeCaptureCapabilities(): Promise<NativeCaptureCapabilities> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NativeCaptureCapabilities>('get_capture_capabilities');
    } catch (e: any) {
      console.error('[DesktopBridge] Failed to get capture capabilities:', e);
      return {
        microphone_supported: false,
        system_audio_supported: false,
        available_devices: [],
        default_device_name: null,
        target_sample_rate: 16000,
        target_channels: 1,
      };
    }
  }

  return {
    microphone_supported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    system_audio_supported: false,
    available_devices: [],
    default_device_name: null,
    target_sample_rate: 16000,
    target_channels: 1,
  };
}

export async function startNativeMeetingCapture(
  meetingId: string,
  dealId?: string | null,
  captureSource?: import('../types').CaptureSource | null
): Promise<NativeCaptureState> {
  if (!isTauriEnvironment()) {
    throw new Error('Native desktop audio capture is only supported in the Kairo desktop application.');
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<NativeCaptureState>('start_meeting_capture', {
      meetingId,
      dealId: dealId || null,
      captureSource: captureSource || 'combined',
    });
  } catch (e: any) {
    console.error('[DesktopBridge] Failed to invoke start_meeting_capture:', e);
    throw new Error(e?.message || 'Failed to start desktop audio capture');
  }
}

export async function pauseNativeMeetingCapture(): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error('Native desktop audio capture is only supported in the Kairo desktop application.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('pause_meeting_capture');
}

export async function resumeNativeMeetingCapture(): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error('Native desktop audio capture is only supported in the Kairo desktop application.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('resume_meeting_capture');
}

export async function stopNativeMeetingCapture(): Promise<NativeCaptureResult> {
  if (!isTauriEnvironment()) {
    throw new Error('Native desktop audio capture is only supported in the Kairo desktop application.');
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<NativeCaptureResult>('stop_meeting_capture');
  } catch (e: any) {
    console.error('[DesktopBridge] Failed to invoke stop_meeting_capture:', e);
    throw new Error(e?.message || 'Failed to stop desktop audio capture');
  }
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
    } catch (e: any) {
      return {
        status: 'idle',
        meeting_id: null,
        deal_id: null,
        elapsed_seconds: 0,
        file_path: null,
        error_message: e?.message || 'Failed to get native capture status',
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

export async function readNativeCaptureBytes(filePath: string): Promise<Blob | null> {
  if (isTauriEnvironment() && filePath) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = await invoke<number[] | Uint8Array>('read_capture_bytes', { filePath });
      const u8 = new Uint8Array(bytes);
      return new Blob([u8.buffer as ArrayBuffer], { type: 'audio/wav' });
    } catch (e) {
      console.error('[DesktopBridge] Failed to read capture bytes:', e);
      return null;
    }
  }
  return null;
}
