use std::collections::VecDeque;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

pub use crate::windows_loopback::SystemLoopbackCapture;

pub const TARGET_SAMPLE_RATE: u32 = 16000;
pub const TARGET_CHANNELS: u16 = 1;
pub const MIXER_CHUNK_SAMPLES: usize = 320; // 20ms at 16000Hz

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NativeCaptureStatus {
    Idle,
    Recording,
    Paused,
    Completed,
    Failed,
    Discarded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureSource {
    Microphone,
    SystemAudio,
    Combined,
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
    pub capture_source: Option<CaptureSource>,
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
    pub capture_source: Option<CaptureSource>,
}

pub struct StreamHandle(pub cpal::Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

/// Clean abstraction for AE local microphone capture via CPAL input streams.
pub struct MicrophoneCapture {
    pub _stream: StreamHandle,
}

impl MicrophoneCapture {
    pub fn is_supported(host: &cpal::Host) -> bool {
        host.default_input_device().is_some()
    }

    pub fn start(
        host: &cpal::Host,
        sample_queue: Arc<Mutex<VecDeque<f32>>>,
        is_running: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
    ) -> Result<Self, String> {
        let mic_device = host.default_input_device().ok_or_else(|| {
            "No default audio input device (microphone) found on this system".to_string()
        })?;

        let mic_config = mic_device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input audio config: {}", e))?;

        let mic_stream = build_resampling_input_stream(
            &mic_device,
            &mic_config,
            sample_queue,
            is_running,
            is_paused,
        )?;

        mic_stream
            .play()
            .map_err(|e| format!("Failed to start microphone stream: {}", e))?;

        Ok(Self {
            _stream: StreamHandle(mic_stream),
        })
    }
}

/// Clean coordinator that manages both local microphone and Windows WASAPI loopback capture streams.
pub struct CombinedCapture {
    pub mic: Option<MicrophoneCapture>,
    pub sys: Option<SystemLoopbackCapture>,
}

impl CombinedCapture {
    pub fn start(
        host: &cpal::Host,
        source: CaptureSource,
        mic_queue: Arc<Mutex<VecDeque<f32>>>,
        sys_queue: Arc<Mutex<VecDeque<f32>>>,
        is_running: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
    ) -> Result<(Self, CaptureSource), String> {
        let mut mic_capture_opt = None;
        let mut sys_capture_opt = None;

        // 1. Microphone setup (if requested)
        if source == CaptureSource::Microphone || source == CaptureSource::Combined {
            match MicrophoneCapture::start(host, mic_queue, is_running.clone(), is_paused.clone()) {
                Ok(cap) => mic_capture_opt = Some(cap),
                Err(e) => {
                    eprintln!("[KairoAudioCapture] Microphone start error: {}", e);
                    if source == CaptureSource::Microphone {
                        return Err(format!("Failed to start microphone capture: {}", e));
                    }
                }
            }
        }

        // 2. Genuine Windows WASAPI loopback setup (if requested)
        if source == CaptureSource::SystemAudio || source == CaptureSource::Combined {
            #[cfg(target_os = "windows")]
            {
                match SystemLoopbackCapture::start(sys_queue, is_running.clone(), is_paused.clone())
                {
                    Ok(cap) => sys_capture_opt = Some(cap),
                    Err(e) => {
                        eprintln!("[KairoAudioCapture] WASAPI loopback start error: {}", e);
                        if source == CaptureSource::SystemAudio {
                            return Err(format!(
                                "Failed to initialize Windows system audio loopback: {}",
                                e
                            ));
                        }
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if source == CaptureSource::SystemAudio {
                    return Err(
                        "System audio loopback is currently only supported on Windows".to_string(),
                    );
                }
            }
        }

        let effective_source = match (mic_capture_opt.is_some(), sys_capture_opt.is_some()) {
            (true, true) => CaptureSource::Combined,
            (true, false) => CaptureSource::Microphone,
            (false, true) => CaptureSource::SystemAudio,
            (false, false) => {
                return Err("No active audio streams could be initialized".to_string());
            }
        };

        Ok((
            Self {
                mic: mic_capture_opt,
                sys: sys_capture_opt,
            },
            effective_source,
        ))
    }

    pub fn stop(&mut self) {
        if let Some(ref mut sys) = self.sys {
            sys.stop();
        }
        self.mic = None;
    }
}

pub struct ActiveSession {
    pub meeting_id: String,
    pub deal_id: Option<String>,
    pub file_path: PathBuf,
    pub capture_source: CaptureSource,
    pub start_time: Instant,
    pub paused_duration_secs: u64,
    pub is_paused: Arc<AtomicBool>,
    pub pause_start: Option<Instant>,
    pub is_running: Arc<AtomicBool>,
    pub capture: CombinedCapture,
    pub mic_queue: Arc<Mutex<VecDeque<f32>>>,
    pub sys_queue: Arc<Mutex<VecDeque<f32>>>,
    pub writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    pub samples_written: Arc<Mutex<u64>>,
    pub mixer_handle: Option<JoinHandle<()>>,
}

pub struct CaptureEngine {
    session: Mutex<Option<ActiveSession>>,
    last_status: Mutex<NativeCaptureStatus>,
    last_error: Mutex<Option<String>>,
}

/// Helper function to mix two normalized audio samples (-1.0 to 1.0)
/// applying soft limiting/clamping to prevent digital clipping.
pub fn mix_samples(mic: f32, sys: f32) -> f32 {
    let combined = mic + sys;
    if combined > 1.0 {
        1.0 - (1.0 / (1.0 + (combined - 1.0)))
    } else if combined < -1.0 {
        -1.0 + (1.0 / (1.0 + (-combined - 1.0)))
    } else {
        combined
    }
}

/// Downmixes multi-channel interleaved float samples to mono.
pub fn downmix_interleaved_to_mono(data: &[f32], channels: usize) -> Vec<f32> {
    if channels == 0 || data.is_empty() {
        return Vec::new();
    }
    if channels == 1 {
        return data.to_vec();
    }
    let mut mono = Vec::with_capacity(data.len() / channels);
    for chunk in data.chunks_exact(channels) {
        let sum: f32 = chunk.iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

/// Resamples mono audio from source sample rate to target rate with phase tracking.
pub fn resample_linear(
    input: &[f32],
    source_rate: u32,
    target_rate: u32,
    phase: &mut f64,
) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }
    if source_rate == target_rate {
        return input.to_vec();
    }

    let step = source_rate as f64 / target_rate as f64;
    let mut output = Vec::with_capacity((input.len() as f64 / step).ceil() as usize + 2);

    while (*phase as usize) < input.len() {
        let idx = *phase as usize;
        let frac = *phase - idx as f64;
        let s0 = input[idx];
        let s1 = if idx + 1 < input.len() {
            input[idx + 1]
        } else {
            s0
        };
        let interp = s0 + (s1 - s0) * (frac as f32);
        output.push(interp.clamp(-1.0, 1.0));
        *phase += step;
    }

    *phase -= input.len() as f64;
    if *phase < 0.0 {
        *phase = 0.0;
    }

    output
}

/// Checks whether real system playback audio loopback is supported on the current platform/host.
/// On Windows, WASAPI loopback is verified through actual Core Audio COM interfaces
/// (IMMDeviceEnumerator, IMMDevice, IAudioClient, AUDCLNT_STREAMFLAGS_LOOPBACK).
/// On other platforms, it returns false explicitly.
pub fn is_system_audio_supported(_host: &cpal::Host) -> bool {
    crate::windows_loopback::is_wasapi_loopback_supported()
}

fn build_resampling_input_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    let source_sample_rate = config.sample_rate().0;
    let source_channels = config.channels() as usize;

    let err_fn = |err| {
        eprintln!("[KairoAudioCapture] Stream error: {}", err);
    };

    let sample_format = config.sample_format();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let mut resample_phase: f64 = 0.0;
            device.build_input_stream(
                &config.clone().into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_running.load(Ordering::Relaxed) || is_paused.load(Ordering::Relaxed) {
                        return;
                    }
                    if source_channels == 0 || data.is_empty() {
                        return;
                    }

                    let mono_frames = downmix_interleaved_to_mono(data, source_channels);
                    let resampled = resample_linear(
                        &mono_frames,
                        source_sample_rate,
                        TARGET_SAMPLE_RATE,
                        &mut resample_phase,
                    );

                    if !resampled.is_empty() {
                        let mut q = sample_queue.lock();
                        if q.len() < 80000 {
                            q.extend(resampled);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let mut resample_phase: f64 = 0.0;
            device.build_input_stream(
                &config.clone().into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if !is_running.load(Ordering::Relaxed) || is_paused.load(Ordering::Relaxed) {
                        return;
                    }
                    if source_channels == 0 || data.is_empty() {
                        return;
                    }

                    let float_frames: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                    let mono_frames = downmix_interleaved_to_mono(&float_frames, source_channels);
                    let resampled = resample_linear(
                        &mono_frames,
                        source_sample_rate,
                        TARGET_SAMPLE_RATE,
                        &mut resample_phase,
                    );

                    if !resampled.is_empty() {
                        let mut q = sample_queue.lock();
                        if q.len() < 80000 {
                            q.extend(resampled);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let mut resample_phase: f64 = 0.0;
            device.build_input_stream(
                &config.clone().into(),
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    if !is_running.load(Ordering::Relaxed) || is_paused.load(Ordering::Relaxed) {
                        return;
                    }
                    if source_channels == 0 || data.is_empty() {
                        return;
                    }

                    let float_frames: Vec<f32> = data
                        .iter()
                        .map(|&s| (s as f32 - 32768.0) / 32768.0)
                        .collect();
                    let mono_frames = downmix_interleaved_to_mono(&float_frames, source_channels);
                    let resampled = resample_linear(
                        &mono_frames,
                        source_sample_rate,
                        TARGET_SAMPLE_RATE,
                        &mut resample_phase,
                    );

                    if !resampled.is_empty() {
                        let mut q = sample_queue.lock();
                        if q.len() < 80000 {
                            q.extend(resampled);
                        }
                    }
                },
                err_fn,
                None,
            )
        }
        _ => return Err("Unsupported audio input sample format".to_string()),
    }
    .map_err(|e| format!("Failed to build CPAL audio stream: {}", e))?;

    Ok(stream)
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

        let system_audio_supported = is_system_audio_supported(&host);

        CaptureCapabilitiesResponse {
            microphone_supported: !available_devices.is_empty() || default_device_name.is_some(),
            system_audio_supported,
            available_devices,
            default_device_name,
            target_sample_rate: TARGET_SAMPLE_RATE,
            target_channels: TARGET_CHANNELS,
        }
    }

    pub fn start_capture(
        &self,
        meeting_id: String,
        deal_id: Option<String>,
        requested_source: Option<CaptureSource>,
    ) -> Result<CaptureStateResponse, String> {
        let mut session_guard = self.session.lock();
        if session_guard.is_some() {
            return Err("A capture session is already in progress".to_string());
        }

        let source = requested_source.unwrap_or(CaptureSource::Combined);
        let host = cpal::default_host();

        let temp_dir = std::env::temp_dir().join("kairo_captures");
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create capture directory: {}", e))?;

        let timestamp = chrono::Utc::now().timestamp();
        let file_name = format!("kairo_meeting_{}_{}.wav", meeting_id, timestamp);
        let file_path = temp_dir.join(file_name);

        let spec = hound::WavSpec {
            channels: TARGET_CHANNELS,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let writer = hound::WavWriter::create(&file_path, spec)
            .map_err(|e| format!("Failed to initialize WAV file: {}", e))?;
        let writer_arc = Arc::new(Mutex::new(Some(writer)));

        let is_running = Arc::new(AtomicBool::new(true));
        let is_paused = Arc::new(AtomicBool::new(false));

        let mic_queue = Arc::new(Mutex::new(VecDeque::with_capacity(16000)));
        let sys_queue = Arc::new(Mutex::new(VecDeque::with_capacity(16000)));

        // Start combined capture coordinator
        let (capture, effective_capture_source) = CombinedCapture::start(
            &host,
            source,
            mic_queue.clone(),
            sys_queue.clone(),
            is_running.clone(),
            is_paused.clone(),
        )?;

        let samples_written_counter = Arc::new(Mutex::new(0u64));

        // Start background mixing thread
        let mixer_writer = writer_arc.clone();
        let mixer_running = is_running.clone();
        let mixer_paused = is_paused.clone();
        let mixer_mic_queue = mic_queue.clone();
        let mixer_sys_queue = sys_queue.clone();
        let mixer_samples_counter = samples_written_counter.clone();

        let mixer_handle = thread::spawn(move || {
            let mut mic_buf = vec![0.0f32; MIXER_CHUNK_SAMPLES];
            let mut sys_buf = vec![0.0f32; MIXER_CHUNK_SAMPLES];

            while mixer_running.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(20));

                if mixer_paused.load(Ordering::Relaxed) {
                    let mut mq = mixer_mic_queue.lock();
                    mq.clear();
                    let mut sq = mixer_sys_queue.lock();
                    sq.clear();
                    continue;
                }

                // Drain up to MIXER_CHUNK_SAMPLES from mic queue
                let mut mic_count = 0;
                {
                    let mut mq = mixer_mic_queue.lock();
                    while mic_count < MIXER_CHUNK_SAMPLES && !mq.is_empty() {
                        if let Some(s) = mq.pop_front() {
                            mic_buf[mic_count] = s;
                            mic_count += 1;
                        }
                    }
                }
                for i in mic_count..MIXER_CHUNK_SAMPLES {
                    mic_buf[i] = 0.0;
                }

                // Drain up to MIXER_CHUNK_SAMPLES from system queue
                let mut sys_count = 0;
                {
                    let mut sq = mixer_sys_queue.lock();
                    while sys_count < MIXER_CHUNK_SAMPLES && !sq.is_empty() {
                        if let Some(s) = sq.pop_front() {
                            sys_buf[sys_count] = s;
                            sys_count += 1;
                        }
                    }
                }
                for i in sys_count..MIXER_CHUNK_SAMPLES {
                    sys_buf[i] = 0.0;
                }

                let frames_to_write = if mic_count > 0 || sys_count > 0 {
                    mic_count.max(sys_count)
                } else {
                    0
                };

                if frames_to_write > 0 {
                    let mut w_guard = mixer_writer.lock();
                    if let Some(ref mut w) = *w_guard {
                        let mut count = 0u64;
                        for i in 0..frames_to_write {
                            let mixed = mix_samples(mic_buf[i], sys_buf[i]);
                            let sample_i16 = (mixed * 32767.0).clamp(-32768.0, 32767.0) as i16;
                            if w.write_sample(sample_i16).is_ok() {
                                count += 1;
                            }
                        }
                        *mixer_samples_counter.lock() += count;
                    }
                }
            }

            // Final drain when stopping
            let mut w_guard = mixer_writer.lock();
            if let Some(ref mut w) = *w_guard {
                let mut mq = mixer_mic_queue.lock();
                let mut sq = mixer_sys_queue.lock();
                let mut count = 0u64;
                while !mq.is_empty() || !sq.is_empty() {
                    let m = mq.pop_front().unwrap_or(0.0);
                    let s = sq.pop_front().unwrap_or(0.0);
                    let mixed = mix_samples(m, s);
                    let sample_i16 = (mixed * 32767.0).clamp(-32768.0, 32767.0) as i16;
                    if w.write_sample(sample_i16).is_ok() {
                        count += 1;
                    }
                }
                *mixer_samples_counter.lock() += count;
            }
        });

        let session = ActiveSession {
            meeting_id: meeting_id.clone(),
            deal_id: deal_id.clone(),
            file_path: file_path.clone(),
            capture_source: effective_capture_source,
            start_time: Instant::now(),
            paused_duration_secs: 0,
            is_paused,
            pause_start: None,
            is_running,
            capture,
            mic_queue,
            sys_queue,
            writer: writer_arc,
            samples_written: samples_written_counter,
            mixer_handle: Some(mixer_handle),
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
            capture_source: Some(effective_capture_source),
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
        let mut session = session_guard
            .take()
            .ok_or_else(|| "No active capture session to stop".to_string())?;

        session.is_running.store(false, Ordering::SeqCst);
        session.capture.stop();

        // Wait for mixer thread to finish flushing buffers
        if let Some(handle) = session.mixer_handle.take() {
            let _ = handle.join();
        }

        // Finalize WAV writer to flush RIFF headers and samples
        {
            let mut writer_guard = session.writer.lock();
            if let Some(w) = writer_guard.take() {
                w.finalize()
                    .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;
            }
        }

        let total_samples = *session.samples_written.lock();
        let calculated_duration = if total_samples > 0 {
            total_samples / TARGET_SAMPLE_RATE as u64
        } else {
            session
                .start_time
                .elapsed()
                .as_secs()
                .saturating_sub(session.paused_duration_secs)
        };

        let file_size = std::fs::metadata(&session.file_path)
            .map(|m| m.len())
            .unwrap_or(0);

        if file_size <= 44 && total_samples == 0 {
            let _ = std::fs::remove_file(&session.file_path);
            *self.last_status.lock() = NativeCaptureStatus::Failed;
            let err =
                "Recording ended without capturing any valid audio frames (0 samples).".to_string();
            *self.last_error.lock() = Some(err.clone());
            return Err(err);
        }

        *self.last_status.lock() = NativeCaptureStatus::Completed;

        Ok(CaptureResultResponse {
            meeting_id: session.meeting_id,
            deal_id: session.deal_id,
            file_path: session.file_path.to_string_lossy().to_string(),
            duration_seconds: calculated_duration,
            sample_rate: TARGET_SAMPLE_RATE,
            channels: TARGET_CHANNELS,
            file_size_bytes: file_size,
            capture_source: Some(session.capture_source),
        })
    }

    pub fn discard_capture(&self) -> Result<(), String> {
        let mut session_guard = self.session.lock();
        if let Some(mut session) = session_guard.take() {
            session.is_running.store(false, Ordering::SeqCst);
            session.capture.stop();
            if let Some(handle) = session.mixer_handle.take() {
                let _ = handle.join();
            }
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
                    session
                        .start_time
                        .elapsed()
                        .as_secs()
                        .saturating_sub(session.paused_duration_secs + paused_now)
                } else {
                    session
                        .start_time
                        .elapsed()
                        .as_secs()
                        .saturating_sub(session.paused_duration_secs)
                }
            } else {
                session
                    .start_time
                    .elapsed()
                    .as_secs()
                    .saturating_sub(session.paused_duration_secs)
            };

            CaptureStateResponse {
                status: if is_paused {
                    NativeCaptureStatus::Paused
                } else {
                    NativeCaptureStatus::Recording
                },
                meeting_id: Some(session.meeting_id.clone()),
                deal_id: session.deal_id.clone(),
                elapsed_seconds: elapsed,
                file_path: Some(session.file_path.to_string_lossy().to_string()),
                error_message: None,
                capture_source: Some(session.capture_source),
            }
        } else {
            CaptureStateResponse {
                status: self.last_status.lock().clone(),
                meeting_id: None,
                deal_id: None,
                elapsed_seconds: 0,
                file_path: None,
                error_message: self.last_error.lock().clone(),
                capture_source: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_downmix_stereo_to_mono() {
        let stereo = vec![0.5, 0.5, -0.5, 0.5, 1.0, 0.0];
        let mono = downmix_interleaved_to_mono(&stereo, 2);
        assert_eq!(mono.len(), 3);
        assert_eq!(mono[0], 0.5);
        assert_eq!(mono[1], 0.0);
        assert_eq!(mono[2], 0.5);
    }

    #[test]
    fn test_downmix_surround_5_1_to_mono() {
        // 6 channels: FL, FR, C, LFE, SL, SR
        let surround = vec![0.6, 0.6, 1.0, 0.2, 0.3, 0.3];
        let mono = downmix_interleaved_to_mono(&surround, 6);
        assert_eq!(mono.len(), 1);
        let expected = (0.6 + 0.6 + 1.0 + 0.2 + 0.3 + 0.3) / 6.0;
        assert!((mono[0] - expected).abs() < 1e-5);
    }

    #[test]
    fn test_downmix_empty_data() {
        let empty: Vec<f32> = Vec::new();
        assert!(downmix_interleaved_to_mono(&empty, 2).is_empty());
        assert!(downmix_interleaved_to_mono(&[1.0, 2.0], 0).is_empty());
    }

    #[test]
    fn test_linear_resample_48k_to_16k() {
        let input: Vec<f32> = (0..480).map(|i| i as f32 / 480.0).collect();
        let mut phase = 0.0;
        let output = resample_linear(&input, 48000, 16000, &mut phase);
        assert_eq!(output.len(), 160);
        assert!((output[0] - 0.0).abs() < 1e-4);
        assert!((output[159] - 0.99375).abs() < 1e-2);
    }

    #[test]
    fn test_linear_resample_44_1k_to_16k() {
        let input: Vec<f32> = vec![0.5; 441];
        let mut phase = 0.0;
        let output = resample_linear(&input, 44100, 16000, &mut phase);
        assert_eq!(output.len(), 160);
        for s in output {
            assert!((s - 0.5).abs() < 1e-4);
        }
    }

    #[test]
    fn test_linear_resample_same_rate() {
        let input = vec![0.1, 0.2, 0.3, 0.4];
        let mut phase = 0.0;
        let output = resample_linear(&input, 16000, 16000, &mut phase);
        assert_eq!(output, input);
    }

    #[test]
    fn test_mix_samples_soft_clamping() {
        // Normal addition without clipping
        assert!((mix_samples(0.2, 0.3) - 0.5).abs() < 1e-5);
        // Over unity soft limiting
        let clamped_high = mix_samples(0.8, 0.8);
        assert!(clamped_high <= 1.0);
        assert!(clamped_high > 0.8);
        // Under negative unity soft limiting
        let clamped_low = mix_samples(-0.8, -0.8);
        assert!(clamped_low >= -1.0);
        assert!(clamped_low < -0.8);
    }

    #[test]
    fn test_capture_source_serialization() {
        let src = CaptureSource::Combined;
        let json = serde_json::to_string(&src).unwrap();
        assert_eq!(json, "\"combined\"");

        let deserialized: CaptureSource = serde_json::from_str("\"system_audio\"").unwrap();
        assert_eq!(deserialized, CaptureSource::SystemAudio);
    }

    #[test]
    fn test_system_audio_capability_matches_wasapi() {
        let host = cpal::default_host();
        let capability = is_system_audio_supported(&host);
        let wasapi_direct = crate::windows_loopback::is_wasapi_loopback_supported();
        assert_eq!(capability, wasapi_direct);
    }

    #[test]
    fn test_mixer_pipeline_drains_both_streams_into_wav() {
        // Test deterministic mixing and writing of dual-channel queues
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_kairo_mixer_drain.wav");

        let spec = hound::WavSpec {
            channels: TARGET_CHANNELS,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::create(&test_file, spec).unwrap();

        // Feed 320 mic samples (0.2) and 320 sys samples (0.3)
        let mic_queue = VecDeque::from(vec![0.2f32; 320]);
        let sys_queue = VecDeque::from(vec![0.3f32; 320]);

        for (m, s) in mic_queue.into_iter().zip(sys_queue.into_iter()) {
            let mixed = mix_samples(m, s);
            let sample_i16 = (mixed * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer.write_sample(sample_i16).unwrap();
        }

        writer.finalize().unwrap();

        let reader = hound::WavReader::open(&test_file).unwrap();
        let samples: Vec<i16> = reader.into_samples::<i16>().map(|s| s.unwrap()).collect();

        assert_eq!(samples.len(), 320);
        let expected_i16 = (0.5 * 32767.0) as i16;
        for s in samples {
            assert!((s - expected_i16).abs() <= 2);
        }

        let _ = std::fs::remove_file(&test_file);
    }
}
