use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NativeCaptureStatus {
    Idle,
    Recording,
    Paused,
    Completed,
    Failed,
    Discarded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureCapabilitiesResponse {
    pub microphone_supported: bool,
    pub system_audio_supported: bool,
    pub available_devices: Vec<String>,
    pub default_device_name: Option<String>,
    pub target_sample_rate: u32,
    pub target_channels: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureStateResponse {
    pub status: NativeCaptureStatus,
    pub meeting_id: Option<String>,
    pub deal_id: Option<String>,
    pub elapsed_seconds: u64,
    pub file_path: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureResultResponse {
    pub meeting_id: String,
    pub deal_id: Option<String>,
    pub file_path: String,
    pub duration_seconds: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub file_size_bytes: u64,
}

pub struct ActiveSession {
    pub meeting_id: String,
    pub deal_id: Option<String>,
    pub file_path: PathBuf,
    pub start_time: Instant,
    pub paused_duration_secs: u64,
    pub is_paused: Arc<AtomicBool>,
    pub pause_start: Option<Instant>,
    pub is_running: Arc<AtomicBool>,
    pub _stream: cpal::Stream,
    pub writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    pub samples_written: Arc<Mutex<u64>>,
}

pub struct CaptureEngine {
    session: Mutex<Option<ActiveSession>>,
    last_status: Mutex<NativeCaptureStatus>,
    last_error: Mutex<Option<String>>,
}

impl CaptureEngine {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
            last_status: Mutex::new(NativeCaptureStatus::Idle),
            last_error: Mutex::new(None),
        }
    }

    pub fn get_capabilities(&self) -> CaptureCapabilitiesResponse {
        let host = cpal::default_host();
        let mut available_devices = Vec::new();
        let mut default_device_name = None;

        if let Ok(devices) = host.input_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    available_devices.push(name);
                }
            }
        }

        if let Some(dev) = host.default_input_device() {
            if let Ok(name) = dev.name() {
                default_device_name = Some(name);
            }
        }

        CaptureCapabilitiesResponse {
            microphone_supported: !available_devices.is_empty(),
            // Cross-platform system audio capture requires platform-specific loopback drivers/WASAPI loopback.
            // Explicitly report capability state so unsupported modes are never claimed.
            system_audio_supported: false,
            available_devices,
            default_device_name,
            target_sample_rate: 16000,
            target_channels: 1,
        }
    }

    pub fn start_capture(&self, meeting_id: String, deal_id: Option<String>) -> Result<CaptureStateResponse, String> {
        let mut session_guard = self.session.lock();
        if session_guard.is_some() {
            return Err("A capture session is already in progress".to_string());
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default audio input device (microphone) found on this system".to_string())?;

        let supported_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input audio config: {}", e))?;

        let temp_dir = std::env::temp_dir().join("kairo_captures");
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create capture directory: {}", e))?;

        let timestamp = chrono::Utc::now().timestamp();
        let file_name = format!("kairo_meeting_{}_{}.wav", meeting_id, timestamp);
        let file_path = temp_dir.join(file_name);

        const TARGET_SAMPLE_RATE: u32 = 16000;
        const TARGET_CHANNELS: u16 = 1;

        let spec = hound::WavSpec {
            channels: TARGET_CHANNELS,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let writer = hound::WavWriter::create(&file_path, spec)
            .map_err(|e| format!("Failed to initialize WAV file: {}", e))?;
        let writer_arc = Arc::new(Mutex::new(Some(writer)));
        let writer_clone = writer_arc.clone();

        let is_running = Arc::new(AtomicBool::new(true));
        let is_paused = Arc::new(AtomicBool::new(false));

        let is_running_clone = is_running.clone();
        let is_paused_clone = is_paused.clone();

        let source_sample_rate = supported_config.sample_rate().0;
        let source_channels = supported_config.channels() as usize;
        let samples_written_counter = Arc::new(Mutex::new(0u64));
        let samples_counter_clone = samples_written_counter.clone();

        let err_fn = |err| {
            eprintln!("[KairoAudioCapture] Stream error: {}", err);
        };

        let sample_format = supported_config.sample_format();

        let mut resample_phase: f64 = 0.0;
        let step = source_sample_rate as f64 / TARGET_SAMPLE_RATE as f64;

        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &supported_config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if !is_running_clone.load(Ordering::Relaxed) || is_paused_clone.load(Ordering::Relaxed) {
                            return;
                        }

                        let mut mono_frames: Vec<f32> = Vec::with_capacity(data.len() / source_channels);
                        for chunk in data.chunks_exact(source_channels) {
                            let sum: f32 = chunk.iter().sum();
                            mono_frames.push(sum / source_channels as f32);
                        }

                        let mut writer_guard = writer_clone.lock();
                        if let Some(ref mut w) = *writer_guard {
                            let mut local_count = 0u64;
                            while (resample_phase as usize) < mono_frames.len() {
                                let idx = resample_phase as usize;
                                let sample_f32 = mono_frames[idx].clamp(-1.0, 1.0);
                                let sample_i16 = (sample_f32 * 32767.0) as i16;
                                if w.write_sample(sample_i16).is_ok() {
                                    local_count += 1;
                                }
                                resample_phase += step;
                            }
                            resample_phase -= mono_frames.len() as f64;
                            if resample_phase < 0.0 {
                                resample_phase = 0.0;
                            }
                            *samples_counter_clone.lock() += local_count;
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &supported_config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if !is_running_clone.load(Ordering::Relaxed) || is_paused_clone.load(Ordering::Relaxed) {
                            return;
                        }

                        let mut mono_frames: Vec<f32> = Vec::with_capacity(data.len() / source_channels);
                        for chunk in data.chunks_exact(source_channels) {
                            let sum: f32 = chunk.iter().map(|&s| s as f32 / 32768.0).sum();
                            mono_frames.push(sum / source_channels as f32);
                        }

                        let mut writer_guard = writer_clone.lock();
                        if let Some(ref mut w) = *writer_guard {
                            let mut local_count = 0u64;
                            while (resample_phase as usize) < mono_frames.len() {
                                let idx = resample_phase as usize;
                                let sample_f32 = mono_frames[idx].clamp(-1.0, 1.0);
                                let sample_i16 = (sample_f32 * 32767.0) as i16;
                                if w.write_sample(sample_i16).is_ok() {
                                    local_count += 1;
                                }
                                resample_phase += step;
                            }
                            resample_phase -= mono_frames.len() as f64;
                            if resample_phase < 0.0 {
                                resample_phase = 0.0;
                            }
                            *samples_counter_clone.lock() += local_count;
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                device.build_input_stream(
                    &supported_config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        if !is_running_clone.load(Ordering::Relaxed) || is_paused_clone.load(Ordering::Relaxed) {
                            return;
                        }

                        let mut mono_frames: Vec<f32> = Vec::with_capacity(data.len() / source_channels);
                        for chunk in data.chunks_exact(source_channels) {
                            let sum: f32 = chunk.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).sum();
                            mono_frames.push(sum / source_channels as f32);
                        }

                        let mut writer_guard = writer_clone.lock();
                        if let Some(ref mut w) = *writer_guard {
                            let mut local_count = 0u64;
                            while (resample_phase as usize) < mono_frames.len() {
                                let idx = resample_phase as usize;
                                let sample_f32 = mono_frames[idx].clamp(-1.0, 1.0);
                                let sample_i16 = (sample_f32 * 32767.0) as i16;
                                if w.write_sample(sample_i16).is_ok() {
                                    local_count += 1;
                                }
                                resample_phase += step;
                            }
                            resample_phase -= mono_frames.len() as f64;
                            if resample_phase < 0.0 {
                                resample_phase = 0.0;
                            }
                            *samples_counter_clone.lock() += local_count;
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err("Unsupported audio input sample format".to_string()),
        }
        .map_err(|e| format!("Failed to build CPAL input stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {}", e))?;

        let session = ActiveSession {
            meeting_id: meeting_id.clone(),
            deal_id: deal_id.clone(),
            file_path: file_path.clone(),
            start_time: Instant::now(),
            paused_duration_secs: 0,
            is_paused,
            pause_start: None,
            is_running,
            _stream: stream,
            writer: writer_arc,
            samples_written: samples_written_counter,
        };

        *session_guard = Some(session);
        *self.last_status.lock() = NativeCaptureStatus::Recording;
        *self.last_error.lock() = None;

        Ok(CaptureStateResponse {
            status: NativeCaptureStatus::Recording,
            meeting_id: Some(meeting_id),
            deal_id,
            elapsed_seconds: 0,
            file_path: Some(file_path.to_string_lossy().to_string()),
            error_message: None,
        })
    }

    pub fn pause_capture(&self) -> Result<(), String> {
        let mut session_guard = self.session.lock();
        if let Some(ref mut session) = *session_guard {
            if !session.is_paused.load(Ordering::Relaxed) {
                session.is_paused.store(true, Ordering::Relaxed);
                session.pause_start = Some(Instant::now());
                *self.last_status.lock() = NativeCaptureStatus::Paused;
                return Ok(());
            }
            return Err("Capture is already paused".to_string());
        }
        Err("No active capture session".to_string())
    }

    pub fn resume_capture(&self) -> Result<(), String> {
        let mut session_guard = self.session.lock();
        if let Some(ref mut session) = *session_guard {
            if session.is_paused.load(Ordering::Relaxed) {
                if let Some(pause_start) = session.pause_start {
                    session.paused_duration_secs += pause_start.elapsed().as_secs();
                }
                session.is_paused.store(false, Ordering::Relaxed);
                session.pause_start = None;
                *self.last_status.lock() = NativeCaptureStatus::Recording;
                return Ok(());
            }
            return Err("Capture is not paused".to_string());
        }
        Err("No active capture session".to_string())
    }

    pub fn stop_capture(&self) -> Result<CaptureResultResponse, String> {
        let mut session_guard = self.session.lock();
        let session = session_guard.take().ok_or_else(|| "No active capture session to stop".to_string())?;

        session.is_running.store(false, Ordering::Relaxed);

        // Finalize WAV writer to flush headers and actual audio frames
        {
            let mut writer_guard = session.writer.lock();
            if let Some(w) = writer_guard.take() {
                w.finalize().map_err(|e| format!("Failed to finalize WAV file: {}", e))?;
            }
        }

        let total_samples = *session.samples_written.lock();
        let calculated_duration = if total_samples > 0 {
            total_samples / 16000
        } else {
            session.start_time.elapsed().as_secs().saturating_sub(session.paused_duration_secs)
        };

        let file_size = std::fs::metadata(&session.file_path)
            .map(|m| m.len())
            .unwrap_or(0);

        *self.last_status.lock() = NativeCaptureStatus::Completed;

        Ok(CaptureResultResponse {
            meeting_id: session.meeting_id,
            deal_id: session.deal_id,
            file_path: session.file_path.to_string_lossy().to_string(),
            duration_seconds: calculated_duration,
            sample_rate: 16000,
            channels: 1,
            file_size_bytes: file_size,
        })
    }

    pub fn discard_capture(&self) -> Result<(), String> {
        let mut session_guard = self.session.lock();
        if let Some(session) = session_guard.take() {
            session.is_running.store(false, Ordering::Relaxed);
            {
                let mut writer_guard = session.writer.lock();
                let _ = writer_guard.take();
            }
            let _ = std::fs::remove_file(&session.file_path);
            *self.last_status.lock() = NativeCaptureStatus::Discarded;
            return Ok(());
        }
        Err("No active capture session to discard".to_string())
    }

    pub fn get_status(&self) -> CaptureStateResponse {
        let session_guard = self.session.lock();
        if let Some(ref session) = *session_guard {
            let is_paused = session.is_paused.load(Ordering::Relaxed);
            let elapsed = if is_paused {
                if let Some(pause_start) = session.pause_start {
                    let paused_now = pause_start.elapsed().as_secs();
                    session.start_time.elapsed().as_secs().saturating_sub(session.paused_duration_secs + paused_now)
                } else {
                    session.start_time.elapsed().as_secs().saturating_sub(session.paused_duration_secs)
                }
            } else {
                session.start_time.elapsed().as_secs().saturating_sub(session.paused_duration_secs)
            };

            CaptureStateResponse {
                status: if is_paused { NativeCaptureStatus::Paused } else { NativeCaptureStatus::Recording },
                meeting_id: Some(session.meeting_id.clone()),
                deal_id: session.deal_id.clone(),
                elapsed_seconds: elapsed,
                file_path: Some(session.file_path.to_string_lossy().to_string()),
                error_message: None,
            }
        } else {
            CaptureStateResponse {
                status: self.last_status.lock().clone(),
                meeting_id: None,
                deal_id: None,
                elapsed_seconds: 0,
                file_path: None,
                error_message: self.last_error.lock().clone(),
            }
        }
    }
}
