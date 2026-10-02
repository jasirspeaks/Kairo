use tauri::State;
use crate::capture::{CaptureEngine, CaptureStateResponse, CaptureResultResponse};

#[tauri::command]
pub fn start_meeting_capture(
    meeting_id: String,
    deal_id: Option<String>,
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureStateResponse, String> {
    engine.start_capture(meeting_id, deal_id)
}

#[tauri::command]
pub fn pause_meeting_capture(
    engine: State<'_, CaptureEngine>,
) -> Result<(), String> {
    engine.pause_capture()
}

#[tauri::command]
pub fn resume_meeting_capture(
    engine: State<'_, CaptureEngine>,
) -> Result<(), String> {
    engine.resume_capture()
}

#[tauri::command]
pub fn stop_meeting_capture(
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureResultResponse, String> {
    engine.stop_capture()
}

#[tauri::command]
pub fn discard_meeting_capture(
    engine: State<'_, CaptureEngine>,
) -> Result<(), String> {
    engine.discard_capture()
}

#[tauri::command]
pub fn get_capture_status(
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureStateResponse, String> {
    Ok(engine.get_status())
}

#[tauri::command]
pub fn read_capture_bytes(file_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&file_path).map_err(|e| format!("Failed to read capture bytes: {}", e))
}
