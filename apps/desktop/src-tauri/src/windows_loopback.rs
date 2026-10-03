//! Genuine Windows WASAPI Loopback Capture Engine
//!
//! Captures actual playback audio from the default Windows render endpoint
//! using Windows Core Audio APIs (IMMDeviceEnumerator, IMMDevice, IAudioClient,
//! IAudioCaptureClient, AUDCLNT_STREAMFLAGS_LOOPBACK).

#[cfg(target_os = "windows")]
use std::collections::VecDeque;
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "windows")]
use std::sync::Arc;
#[cfg(target_os = "windows")]
use std::thread::{self, JoinHandle};
#[cfg(target_os = "windows")]
use std::time::Duration;

#[cfg(target_os = "windows")]
use parking_lot::Mutex;

#[cfg(target_os = "windows")]
use windows::core::GUID;
#[cfg(target_os = "windows")]
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEXTENSIBLE,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

#[cfg(target_os = "windows")]
use crate::capture::{downmix_interleaved_to_mono, resample_linear, TARGET_SAMPLE_RATE};

pub const WAVE_FORMAT_PCM: u16 = 1;
pub const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
pub const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;

#[cfg(target_os = "windows")]
pub const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID =
    GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);
#[cfg(target_os = "windows")]
pub const KSDATAFORMAT_SUBTYPE_PCM: GUID = GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioSampleFormat {
    Float32,
    Int16,
    Int32,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct WasapiStreamInfo {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub format: AudioSampleFormat,
}

/// Helper function to parse audio sample format from wave format tag and subformat GUID.
pub fn determine_audio_sample_format(
    w_format_tag: u16,
    bits_per_sample: u16,
    #[cfg(target_os = "windows")] sub_format: Option<GUID>,
    #[cfg(not(target_os = "windows"))] _sub_format: Option<()>,
) -> AudioSampleFormat {
    if w_format_tag == WAVE_FORMAT_IEEE_FLOAT {
        AudioSampleFormat::Float32
    } else if w_format_tag == WAVE_FORMAT_PCM {
        if bits_per_sample == 16 {
            AudioSampleFormat::Int16
        } else if bits_per_sample == 32 {
            AudioSampleFormat::Int32
        } else {
            AudioSampleFormat::Unknown
        }
    } else if w_format_tag == WAVE_FORMAT_EXTENSIBLE {
        #[cfg(target_os = "windows")]
        if let Some(sub) = sub_format {
            if sub == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
                return AudioSampleFormat::Float32;
            } else if sub == KSDATAFORMAT_SUBTYPE_PCM {
                if bits_per_sample == 16 {
                    return AudioSampleFormat::Int16;
                } else if bits_per_sample == 32 {
                    return AudioSampleFormat::Int32;
                }
            }
        }
        AudioSampleFormat::Unknown
    } else {
        AudioSampleFormat::Unknown
    }
}

/// Decodes raw byte buffer received from IAudioCaptureClient into normalized f32 samples.
/// Handles silent buffers (AUDCLNT_BUFFERFLAGS_SILENT) by producing clean silence without reading raw bytes.
pub fn decode_raw_audio_packet(
    p_data: *const u8,
    num_frames: usize,
    channels: usize,
    format: AudioSampleFormat,
    is_silent: bool,
    out: &mut Vec<f32>,
) {
    let total_samples = num_frames * channels;
    out.clear();
    out.reserve(total_samples);

    if is_silent || p_data.is_null() {
        out.resize(total_samples, 0.0f32);
        return;
    }

    unsafe {
        match format {
            AudioSampleFormat::Float32 => {
                let float_slice = std::slice::from_raw_parts(p_data as *const f32, total_samples);
                out.extend_from_slice(float_slice);
            }
            AudioSampleFormat::Int16 => {
                let i16_slice = std::slice::from_raw_parts(p_data as *const i16, total_samples);
                for &s in i16_slice {
                    out.push(s as f32 / 32768.0);
                }
            }
            AudioSampleFormat::Int32 => {
                let i32_slice = std::slice::from_raw_parts(p_data as *const i32, total_samples);
                for &s in i32_slice {
                    out.push(s as f32 / 2147483648.0);
                }
            }
            AudioSampleFormat::Unknown => {
                out.resize(total_samples, 0.0f32);
            }
        }
    }
}

/// Checks whether genuine WASAPI loopback capture is supported and accessible
/// on the current Windows host.
///
/// This does NOT merely check if an output device exists; it verifies that:
/// 1. COM Multi-Threaded apartment can be initialized or joined.
/// 2. IMMDeviceEnumerator can be instantiated.
/// 3. The default Windows render endpoint (eRender, eConsole) is active and retrievable.
/// 4. An IAudioClient can be activated on that render endpoint.
/// 5. The device mix format can be successfully queried.
pub fn is_wasapi_loopback_supported() -> bool {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            let com_initialized = hr.is_ok();

            let supported = (|| -> windows::core::Result<bool> {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
                let device: IMMDevice = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
                let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
                let pwfx = audio_client.GetMixFormat()?;
                if !pwfx.is_null() {
                    CoTaskMemFree(Some(pwfx as _));
                    Ok(true)
                } else {
                    Ok(false)
                }
            })()
            .unwrap_or(false);

            if com_initialized {
                CoUninitialize();
            }

            supported
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
pub struct SystemLoopbackCapture {
    join_handle: Option<JoinHandle<()>>,
    is_running: Arc<AtomicBool>,
}

#[cfg(not(target_os = "windows"))]
pub struct SystemLoopbackCapture;

#[cfg(target_os = "windows")]
impl SystemLoopbackCapture {
    pub fn is_supported() -> bool {
        is_wasapi_loopback_supported()
    }

    pub fn start(
        sample_queue: Arc<Mutex<VecDeque<f32>>>,
        is_running: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
    ) -> Result<Self, String> {
        let thread_running = is_running.clone();
        let thread_paused = is_paused.clone();

        let (init_tx, init_rx) = std::sync::mpsc::channel::<Result<WasapiStreamInfo, String>>();

        let handle = thread::Builder::new()
            .name("kairo-wasapi-loopback".to_string())
            .spawn(move || {
                let run_result = unsafe {
                    run_wasapi_loopback_thread(sample_queue, thread_running, thread_paused, init_tx)
                };
                if let Err(e) = run_result {
                    eprintln!("[KairoWASAPI] Loopback thread terminated with error: {}", e);
                }
            })
            .map_err(|e| format!("Failed to spawn WASAPI loopback thread: {}", e))?;

        // Wait for loopback stream initialization confirmation
        match init_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(info)) => {
                println!(
                    "[KairoWASAPI] Loopback capture successfully initialized: {}Hz, {} channels, {:?} ({}-bit)",
                    info.sample_rate, info.channels, info.format, info.bits_per_sample
                );
                Ok(Self {
                    join_handle: Some(handle),
                    is_running,
                })
            }
            Ok(Err(e)) => Err(format!("WASAPI loopback initialization failed: {}", e)),
            Err(_) => Err("WASAPI loopback initialization timed out".to_string()),
        }
    }

    pub fn stop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl SystemLoopbackCapture {
    pub fn is_supported() -> bool {
        false
    }

    pub fn start(
        _sample_queue: std::sync::Arc<parking_lot::Mutex<std::collections::VecDeque<f32>>>,
        _is_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
        _is_paused: std::sync::Arc<std::sync::atomic::AtomicBool>,
    ) -> Result<Self, String> {
        Err("WASAPI loopback capture is only supported on Windows".to_string())
    }

    pub fn stop(&mut self) {}
}

#[cfg(target_os = "windows")]
unsafe fn run_wasapi_loopback_thread(
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    init_tx: std::sync::mpsc::Sender<Result<WasapiStreamInfo, String>>,
) -> Result<(), String> {
    let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
    let com_initialized = hr.is_ok();

    let stream_result =
        (|| -> windows::core::Result<(IAudioClient, IAudioCaptureClient, WasapiStreamInfo)> {
            // 1. Enumerate default Windows render endpoint
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device: IMMDevice = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;

            // 2. Activate IAudioClient
            let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;

            // 3. Query the render endpoint mix format
            let pwfx = audio_client.GetMixFormat()?;
            if pwfx.is_null() {
                return Err(windows::core::Error::from_win32());
            }

            let w_format_tag = (*pwfx).wFormatTag;
            let sample_rate = (*pwfx).nSamplesPerSec;
            let channels = (*pwfx).nChannels;
            let bits_per_sample = (*pwfx).wBitsPerSample;

            let sub_format = if w_format_tag == WAVE_FORMAT_EXTENSIBLE {
                let ext = &*(pwfx as *const WAVEFORMATEXTENSIBLE);
                Some(std::ptr::addr_of!(ext.SubFormat).read_unaligned())
            } else {
                None
            };

            let format = determine_audio_sample_format(w_format_tag, bits_per_sample, sub_format);

            let info = WasapiStreamInfo {
                sample_rate,
                channels,
                bits_per_sample,
                format,
            };

            if format == AudioSampleFormat::Unknown {
                CoTaskMemFree(Some(pwfx as _));
                return Err(windows::core::Error::new(
                    windows::core::HRESULT(-1),
                    format!(
                        "Unsupported render format: tag=0x{:X}, bits={}",
                        w_format_tag, bits_per_sample
                    ),
                ));
            }

            // 4. Initialize client for WASAPI loopback capture
            // Buffer duration: 200ms (2,000,000 in 100ns units)
            let buffer_duration_100ns = 2_000_000i64;
            audio_client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                buffer_duration_100ns,
                0,
                pwfx,
                None,
            )?;

            CoTaskMemFree(Some(pwfx as _));

            // 5. Obtain IAudioCaptureClient
            let capture_client: IAudioCaptureClient =
                audio_client.GetService::<IAudioCaptureClient>()?;

            // 6. Start the loopback stream
            audio_client.Start()?;

            Ok((audio_client, capture_client, info))
        })();

    let (audio_client, capture_client, info) = match stream_result {
        Ok(res) => {
            let _ = init_tx.send(Ok(res.2.clone()));
            (res.0, res.1, res.2)
        }
        Err(e) => {
            let err_msg = format!("Core audio loopback failure: {}", e);
            let _ = init_tx.send(Err(err_msg.clone()));
            if com_initialized {
                CoUninitialize();
            }
            return Err(err_msg);
        }
    };

    let channels = info.channels as usize;
    let sample_rate = info.sample_rate;
    let format = info.format;
    let mut resample_phase: f64 = 0.0;

    let mut decoded_f32_buffer: Vec<f32> = Vec::with_capacity(4096);

    // Main capture loop
    while is_running.load(Ordering::Relaxed) {
        if is_paused.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(15));
            continue;
        }

        let mut packet_size = match capture_client.GetNextPacketSize() {
            Ok(size) => size,
            Err(_) => {
                thread::sleep(Duration::from_millis(5));
                continue;
            }
        };

        if packet_size == 0 {
            // No packet ready yet, sleep briefly to avoid busy loop
            thread::sleep(Duration::from_millis(5));
            continue;
        }

        while packet_size > 0 && is_running.load(Ordering::Relaxed) {
            let mut p_data = std::ptr::null_mut();
            let mut num_frames_read = 0u32;
            let mut flags = 0u32;

            let hr =
                capture_client.GetBuffer(&mut p_data, &mut num_frames_read, &mut flags, None, None);

            if hr.is_err() || num_frames_read == 0 || p_data.is_null() {
                break;
            }

            let is_silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;

            decode_raw_audio_packet(
                p_data,
                num_frames_read as usize,
                channels,
                format,
                is_silent,
                &mut decoded_f32_buffer,
            );

            let _ = capture_client.ReleaseBuffer(num_frames_read);

            // Process audio frames: downmix to mono, resample to 16kHz, queue
            if !decoded_f32_buffer.is_empty() {
                let mono_frames = downmix_interleaved_to_mono(&decoded_f32_buffer, channels);
                let resampled = resample_linear(
                    &mono_frames,
                    sample_rate,
                    TARGET_SAMPLE_RATE,
                    &mut resample_phase,
                );

                if !resampled.is_empty() {
                    let mut q = sample_queue.lock();
                    // Capacity safeguard to avoid unbounded memory growth
                    if q.len() < 80000 {
                        q.extend(resampled);
                    }
                }
            }

            // Check if another packet is already waiting
            match capture_client.GetNextPacketSize() {
                Ok(next_size) => packet_size = next_size,
                Err(_) => break,
            }
        }
    }

    // Stop stream cleanly
    let _ = audio_client.Stop();

    if com_initialized {
        CoUninitialize();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_audio_sample_format_ieee_float() {
        let fmt = determine_audio_sample_format(WAVE_FORMAT_IEEE_FLOAT, 32, None);
        assert_eq!(fmt, AudioSampleFormat::Float32);
    }

    #[test]
    fn test_determine_audio_sample_format_pcm_16() {
        let fmt = determine_audio_sample_format(WAVE_FORMAT_PCM, 16, None);
        assert_eq!(fmt, AudioSampleFormat::Int16);
    }

    #[test]
    fn test_determine_audio_sample_format_pcm_32() {
        let fmt = determine_audio_sample_format(WAVE_FORMAT_PCM, 32, None);
        assert_eq!(fmt, AudioSampleFormat::Int32);
    }

    #[test]
    fn test_determine_audio_sample_format_unsupported_pcm() {
        let fmt = determine_audio_sample_format(WAVE_FORMAT_PCM, 8, None);
        assert_eq!(fmt, AudioSampleFormat::Unknown);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_determine_audio_sample_format_extensible_float() {
        let fmt = determine_audio_sample_format(
            WAVE_FORMAT_EXTENSIBLE,
            32,
            Some(KSDATAFORMAT_SUBTYPE_IEEE_FLOAT),
        );
        assert_eq!(fmt, AudioSampleFormat::Float32);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_determine_audio_sample_format_extensible_pcm_16() {
        let fmt = determine_audio_sample_format(
            WAVE_FORMAT_EXTENSIBLE,
            16,
            Some(KSDATAFORMAT_SUBTYPE_PCM),
        );
        assert_eq!(fmt, AudioSampleFormat::Int16);
    }

    #[test]
    fn test_decode_raw_audio_packet_float32() {
        let samples: [f32; 4] = [0.0, 0.5, -0.5, 1.0];
        let bytes =
            unsafe { std::slice::from_raw_parts(samples.as_ptr() as *const u8, samples.len() * 4) };
        let mut out = Vec::new();
        decode_raw_audio_packet(
            bytes.as_ptr(),
            2,
            2,
            AudioSampleFormat::Float32,
            false,
            &mut out,
        );
        assert_eq!(out.len(), 4);
        assert_eq!(out, vec![0.0, 0.5, -0.5, 1.0]);
    }

    #[test]
    fn test_decode_raw_audio_packet_int16() {
        let samples: [i16; 4] = [0, 16384, -16384, 32767];
        let bytes =
            unsafe { std::slice::from_raw_parts(samples.as_ptr() as *const u8, samples.len() * 2) };
        let mut out = Vec::new();
        decode_raw_audio_packet(
            bytes.as_ptr(),
            2,
            2,
            AudioSampleFormat::Int16,
            false,
            &mut out,
        );
        assert_eq!(out.len(), 4);
        assert!((out[0] - 0.0).abs() < 1e-4);
        assert!((out[1] - 0.5).abs() < 1e-4);
        assert!((out[2] - (-0.5)).abs() < 1e-4);
        assert!((out[3] - 0.999969).abs() < 1e-4);
    }

    #[test]
    fn test_decode_raw_audio_packet_silent_flag_produces_clean_zeros() {
        // Even with non-zero garbage bytes, silent flag must produce zeros
        let garbage: [u8; 16] = [0xFF; 16];
        let mut out = Vec::new();
        decode_raw_audio_packet(
            garbage.as_ptr(),
            4,
            1,
            AudioSampleFormat::Float32,
            true,
            &mut out,
        );
        assert_eq!(out.len(), 4);
        assert_eq!(out, vec![0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_decode_raw_audio_packet_null_data() {
        let mut out = Vec::new();
        decode_raw_audio_packet(
            std::ptr::null(),
            4,
            2,
            AudioSampleFormat::Float32,
            false,
            &mut out,
        );
        assert_eq!(out.len(), 8);
        assert_eq!(out, vec![0.0; 8]);
    }

    #[test]
    fn test_render_stream_downmix_and_resample_pipeline() {
        // Simulate a 48kHz stereo render packet of 480 frames (10ms)
        // Frequency f = 400Hz
        let mut raw_stereo = Vec::with_capacity(960);
        for i in 0..480 {
            let s = ((i as f32 * 2.0 * std::f32::consts::PI * 400.0) / 48000.0).sin();
            raw_stereo.push(s); // Left
            raw_stereo.push(s); // Right
        }

        let mono = downmix_interleaved_to_mono(&raw_stereo, 2);
        assert_eq!(mono.len(), 480);

        let mut phase = 0.0;
        let resampled = resample_linear(&mono, 48000, 16000, &mut phase);
        // 480 frames at 48kHz is 10ms -> 160 frames at 16kHz
        assert_eq!(resampled.len(), 160);
        assert!(resampled.iter().any(|&s| s.abs() > 0.05));
    }

    #[test]
    fn test_wasapi_loopback_capability_query() {
        // Must execute safely and return a boolean without panicking
        let supported = is_wasapi_loopback_supported();
        println!(
            "WASAPI Loopback supported on this test runner: {}",
            supported
        );
    }
}
