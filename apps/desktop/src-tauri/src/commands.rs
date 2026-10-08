use crate::capture::{
    CaptureCapabilitiesResponse, CaptureEngine, CaptureResultResponse, CaptureStateResponse,
};
use std::path::{Path, PathBuf};
use tauri::State;

/// Validates that a file path strictly points to an authorized capture file
/// within the application-owned `kairo_captures` temporary directory.
/// Prevents path traversal and arbitrary filesystem read/delete attempts.
pub fn validate_capture_path(file_path: &str) -> Result<PathBuf, String> {
    if file_path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    let path = Path::new(file_path);

    // Verify filename format: must be kairo_meeting_{id}_{ts}.wav
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file path: missing filename".to_string())?;

    if !file_name.starts_with("kairo_meeting_") || !file_name.ends_with(".wav") {
        return Err(
            "Access denied: file is not an authorized Kairo meeting capture WAV file".to_string(),
        );
    }

    // Ensure the capture base directory exists
    let capture_dir = std::env::temp_dir().join("kairo_captures");
    if let Err(e) = std::fs::create_dir_all(&capture_dir) {
        return Err(format!("Failed to create or access capture directory: {}", e));
    }

    // Canonicalize capture directory to resolve any symlinks or relative paths
    let canonical_dir = capture_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve capture directory: {}", e))?;

    // Canonicalize target path or its parent if file does not exist yet
    let canonical_path = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Failed to resolve target file path: {}", e))?
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| "Invalid file path: missing parent directory".to_string())?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to resolve parent directory: {}", e))?;
        canonical_parent.join(file_name)
    };

    // Verify that the target path is strictly within the canonical capture directory
    if !canonical_path.starts_with(&canonical_dir) {
        return Err(
            "Access denied: path traversal attempt detected outside Kairo capture storage"
                .to_string(),
        );
    }

    Ok(canonical_path)
}

#[tauri::command]
pub fn get_capture_capabilities(
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureCapabilitiesResponse, String> {
    Ok(engine.get_capabilities())
}

#[tauri::command]
pub fn start_meeting_capture(
    meeting_id: String,
    deal_id: Option<String>,
    capture_source: Option<crate::capture::CaptureSource>,
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureStateResponse, String> {
    engine.start_capture(meeting_id, deal_id, capture_source)
}

#[tauri::command]
pub fn pause_meeting_capture(engine: State<'_, CaptureEngine>) -> Result<(), String> {
    engine.pause_capture()
}

#[tauri::command]
pub fn resume_meeting_capture(engine: State<'_, CaptureEngine>) -> Result<(), String> {
    engine.resume_capture()
}

#[tauri::command]
pub fn stop_meeting_capture(
    engine: State<'_, CaptureEngine>,
) -> Result<CaptureResultResponse, String> {
    engine.stop_capture()
}

#[tauri::command]
pub fn discard_meeting_capture(engine: State<'_, CaptureEngine>) -> Result<(), String> {
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
    let valid_path = validate_capture_path(&file_path)?;
    std::fs::read(&valid_path).map_err(|e| format!("Failed to read capture bytes: {}", e))
}

#[tauri::command]
pub fn delete_capture_file(file_path: String) -> Result<bool, String> {
    let valid_path = validate_capture_path(&file_path)?;
    if valid_path.exists() {
        std::fs::remove_file(&valid_path)
            .map_err(|e| format!("Failed to delete capture file: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn cleanup_stale_captures(max_age_seconds: Option<u64>) -> Result<usize, String> {
    let max_age_secs = max_age_seconds.unwrap_or(24 * 3600); // default 24h
    let capture_dir = std::env::temp_dir().join("kairo_captures");
    if !capture_dir.exists() {
        return Ok(0);
    }

    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(&capture_dir) {
        let now = std::time::SystemTime::now();
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("kairo_meeting_") && name.ends_with(".wav") {
                    if let Ok(metadata) = entry.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(elapsed) = now.duration_since(modified) {
                                if elapsed.as_secs() >= max_age_secs {
                                    if std::fs::remove_file(&path).is_ok() {
                                        removed += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(removed)
}
