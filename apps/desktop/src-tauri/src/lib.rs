pub mod capture;
pub mod commands;

use capture::CaptureEngine;
use commands::{
    start_meeting_capture,
    pause_meeting_capture,
    resume_meeting_capture,
    stop_meeting_capture,
    discard_meeting_capture,
    get_capture_status,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let capture_engine = CaptureEngine::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(capture_engine)
        .invoke_handler(tauri::generate_handler![
            start_meeting_capture,
            pause_meeting_capture,
            resume_meeting_capture,
            stop_meeting_capture,
            discard_meeting_capture,
            get_capture_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kairo desktop application");
}
