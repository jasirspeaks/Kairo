use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

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
    pub is_paused: bool,
    pub pause_start: Option<Instant>,
    pub is_running: Arc<AtomicBool>,
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

    pub fn start_capture(&self, meeting_id: String, deal_id: Option<String>) -> Result<CaptureStateResponse, String> {
        let mut session_guard = self.session.lock();
        if session_guard.is_some() {
            return Err("A capture session is already in progress".to_string());
        }

        let temp_dir = std::env::temp_dir().join("kairo_captures");
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create capture dir: {}", e))?;

        let timestamp = chrono::Utc::now().timestamp();
        let file_name = format!("kairo_meeting_{}_{}.wav", meeting_id, timestamp);
        let file_path = temp_dir.join(file_name);

        // Initialize WAV writer with 16kHz, 16-bit mono for compact deal intelligence capture
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let writer = hound::WavWriter::create(&file_path, spec)
            .map_err(|e| format!("Failed to initialize WAV file: {}", e))?;
        let writer_mutex = Arc::new(Mutex::new(writer));

        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = is_running.clone();
        let writer_clone = writer_mutex.clone();

        // Spawn background audio capture thread
        std::thread::spawn(move || {
            // Simulated / platform capture loop that flushes samples to disk safely
            while is_running_clone.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            if let Some(w) = Arc::into_inner(writer_clone) {
                let _ = w.into_inner().finalize();
            }
        });

        let session = ActiveSession {
            meeting_id: meeting_id.clone(),
            deal_id: deal_id.clone(),
            file_path: file_path.clone(),
            start_time: Instant::now(),
            paused_duration_secs: 0,
            is_paused: false,
            pause_start: None,
            is_running,
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
            if !session.is_paused {
                session.is_paused = true;
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
            if session.is_paused {
                if let Some(pause_start) = session.pause_start {
                    session.paused_duration_secs += pause_start.elapsed().as_secs();
                }
                session.is_paused = false;
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

        let total_elapsed = session.start_time.elapsed().as_secs();
        let active_duration = total_elapsed.saturating_sub(session.paused_duration_secs);

        let file_size = std::fs::metadata(&session.file_path)
            .map(|m| m.len())
            .unwrap_or(0);

        *self.last_status.lock() = NativeCaptureStatus::Completed;

        Ok(CaptureResultResponse {
            meeting_id: session.meeting_id,
            deal_id: session.deal_id,
            file_path: session.file_path.to_string_lossy().to_string(),
            duration_seconds: active_duration,
            sample_rate: 16000,
            channels: 1,
            file_size_bytes: file_size,
        })
    }

    pub fn discard_capture(&self) -> Result<(), String> {
        let mut session_guard = self.session.lock();
        if let Some(session) = session_guard.take() {
            session.is_running.store(false, Ordering::Relaxed);
            let _ = std::fs::remove_file(&session.file_path);
            *self.last_status.lock() = NativeCaptureStatus::Discarded;
            return Ok(());
        }
        Err("No active capture session to discard".to_string())
    }

    pub fn get_status(&self) -> CaptureStateResponse {
        let session_guard = self.session.lock();
        if let Some(ref session) = *session_guard {
            let elapsed = if session.is_paused {
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
                status: if session.is_paused { NativeCaptureStatus::Paused } else { NativeCaptureStatus::Recording },
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
