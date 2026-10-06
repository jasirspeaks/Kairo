pub mod capture;
pub mod commands;
pub mod windows_loopback;

use capture::CaptureEngine;
use commands::{
    discard_meeting_capture, get_capture_capabilities, get_capture_status, pause_meeting_capture,
    read_capture_bytes, resume_meeting_capture, start_meeting_capture, stop_meeting_capture,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let capture_engine = CaptureEngine::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(capture_engine)
        .invoke_handler(tauri::generate_handler![
            get_capture_capabilities,
            start_meeting_capture,
            pause_meeting_capture,
            resume_meeting_capture,
            stop_meeting_capture,
            discard_meeting_capture,
            get_capture_status,
            read_capture_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kairo desktop application");
}
