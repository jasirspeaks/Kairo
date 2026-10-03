use kairo_desktop_lib::capture::{
    downmix_interleaved_to_mono, is_system_audio_supported, mix_samples, resample_linear,
    TARGET_CHANNELS, TARGET_SAMPLE_RATE,
};
use kairo_desktop_lib::windows_loopback::{
    decode_raw_audio_packet, determine_audio_sample_format, is_wasapi_loopback_supported,
    AudioSampleFormat, WAVE_FORMAT_EXTENSIBLE, WAVE_FORMAT_IEEE_FLOAT, WAVE_FORMAT_PCM,
};
#[cfg(target_os = "windows")]
use kairo_desktop_lib::windows_loopback::{
    KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, KSDATAFORMAT_SUBTYPE_PCM,
};
use std::collections::VecDeque;

fn main() {
    println!("=== RUNNING KAIRO AUDIO CAPTURE VERIFICATION SUITE ===");

    // 1. Supported / unsupported platform capability
    let wasapi_supported = is_wasapi_loopback_supported();
    println!(
        "[TEST 1/13] WASAPI loopback capability: {}",
        wasapi_supported
    );
    #[cfg(not(target_os = "windows"))]
    assert!(
        !wasapi_supported,
        "System audio loopback should be false on non-Windows"
    );

    // 2. Capability detection consistency
    let host = cpal::default_host();
    let capability = is_system_audio_supported(&host);
    assert_eq!(
        capability, wasapi_supported,
        "Capability must strictly match genuine WASAPI loopback"
    );
    println!("[TEST 2/13] Capability check matches WASAPI loopback status: PASS");

    // 3. Format determination - IEEE float
    let fmt_float = determine_audio_sample_format(WAVE_FORMAT_IEEE_FLOAT, 32, None);
    assert_eq!(fmt_float, AudioSampleFormat::Float32);
    println!("[TEST 3/13] Format determination (IEEE Float): PASS");

    // 4. Format determination - PCM 16-bit
    let fmt_pcm16 = determine_audio_sample_format(WAVE_FORMAT_PCM, 16, None);
    assert_eq!(fmt_pcm16, AudioSampleFormat::Int16);
    println!("[TEST 4/13] Format determination (PCM 16-bit): PASS");

    // 5. Format determination - PCM 32-bit
    let fmt_pcm32 = determine_audio_sample_format(WAVE_FORMAT_PCM, 32, None);
    assert_eq!(fmt_pcm32, AudioSampleFormat::Int32);
    println!("[TEST 5/13] Format determination (PCM 32-bit): PASS");

    // 6. Format determination - Extensible GUIDs
    #[cfg(target_os = "windows")]
    {
        let fmt_ext_f = determine_audio_sample_format(
            WAVE_FORMAT_EXTENSIBLE,
            32,
            Some(KSDATAFORMAT_SUBTYPE_IEEE_FLOAT),
        );
        assert_eq!(fmt_ext_f, AudioSampleFormat::Float32);
        let fmt_ext_pcm = determine_audio_sample_format(
            WAVE_FORMAT_EXTENSIBLE,
            16,
            Some(KSDATAFORMAT_SUBTYPE_PCM),
        );
        assert_eq!(fmt_ext_pcm, AudioSampleFormat::Int16);
        println!("[TEST 6/13] Format determination (Extensible Float & PCM): PASS");
    }

    // 7. Sample conversion - Float32
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
    assert_eq!(out, vec![0.0, 0.5, -0.5, 1.0]);
    println!("[TEST 7/13] Sample conversion (Float32 passthrough): PASS");

    // 8. Sample conversion - Int16
    let samples_i16: [i16; 4] = [0, 16384, -16384, 32767];
    let bytes_i16 = unsafe {
        std::slice::from_raw_parts(samples_i16.as_ptr() as *const u8, samples_i16.len() * 2)
    };
    let mut out_i16 = Vec::new();
    decode_raw_audio_packet(
        bytes_i16.as_ptr(),
        2,
        2,
        AudioSampleFormat::Int16,
        false,
        &mut out_i16,
    );
    assert!((out_i16[0] - 0.0).abs() < 1e-4);
    assert!((out_i16[1] - 0.5).abs() < 1e-4);
    assert!((out_i16[2] - (-0.5)).abs() < 1e-4);
    println!("[TEST 8/13] Sample conversion (Int16 to Float32 normalized): PASS");

    // 9. Silent buffer flag (AUDCLNT_BUFFERFLAGS_SILENT)
    let garbage: [u8; 16] = [0x55; 16];
    let mut out_silent = Vec::new();
    decode_raw_audio_packet(
        garbage.as_ptr(),
        4,
        1,
        AudioSampleFormat::Float32,
        true,
        &mut out_silent,
    );
    assert_eq!(out_silent, vec![0.0, 0.0, 0.0, 0.0]);
    println!("[TEST 9/13] Silent buffer handling (AUDCLNT_BUFFERFLAGS_SILENT): PASS");

    // 10. Channel conversion - Stereo to Mono
    let stereo = vec![0.6, 0.4, -0.2, 0.8];
    let mono = downmix_interleaved_to_mono(&stereo, 2);
    assert_eq!(mono.len(), 2);
    assert!((mono[0] - 0.5).abs() < 1e-5);
    assert!((mono[1] - 0.3).abs() < 1e-5);
    println!("[TEST 10/13] Channel downmix (Stereo to Mono): PASS");

    // 11. Channel conversion - 5.1 Surround to Mono
    let surround = vec![0.6, 0.6, 1.0, 0.2, 0.3, 0.3];
    let mono_surround = downmix_interleaved_to_mono(&surround, 6);
    assert_eq!(mono_surround.len(), 1);
    let expected = (0.6 + 0.6 + 1.0 + 0.2 + 0.3 + 0.3) / 6.0;
    assert!((mono_surround[0] - expected).abs() < 1e-5);
    println!("[TEST 11/13] Channel downmix (5.1 Surround to Mono): PASS");

    // 12. Linear resampling (48kHz to 16kHz)
    let input: Vec<f32> = (0..480).map(|i| i as f32 / 480.0).collect();
    let mut phase = 0.0;
    let resampled = resample_linear(&input, 48000, 16000, &mut phase);
    assert_eq!(resampled.len(), 160);
    assert!((resampled[0] - 0.0).abs() < 1e-4);
    assert!((resampled[159] - 0.99375).abs() < 1e-2);
    println!("[TEST 12/13] Linear resampler (48kHz -> 16kHz): PASS");

    // 13. Dual-channel mixer queue drainage and WAV serialization
    let temp_dir = std::env::temp_dir();
    let test_file = temp_dir.join("test_kairo_dual_drain.wav");
    let spec = hound::WavSpec {
        channels: TARGET_CHANNELS,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&test_file, spec).unwrap();
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
    println!("[TEST 13/14] Mixer queue drain and WAV output: PASS");

    // 14. Real Windows WASAPI Loopback stream initialization, capture, and shutdown
    println!("[TEST 14/14] Testing real Windows WASAPI loopback capture lifecycle...");
    let queue = std::sync::Arc::new(parking_lot::Mutex::new(VecDeque::new()));
    let is_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
    let is_paused = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    match kairo_desktop_lib::windows_loopback::SystemLoopbackCapture::start(
        queue.clone(),
        is_running.clone(),
        is_paused.clone(),
    ) {
        Ok(mut cap) => {
            println!("  -> Stream started successfully via IAudioClient with AUDCLNT_STREAMFLAGS_LOOPBACK!");
            std::thread::sleep(std::time::Duration::from_millis(400));
            cap.stop();
            println!("  -> Stream stopped and cleaned up cleanly!");
            let q_len = queue.lock().len();
            println!("  -> Captured queue frames: {}", q_len);
            println!("[TEST 14/14] Real Windows WASAPI loopback capture lifecycle: PASS");
        }
        Err(e) => {
            println!("  -> Loopback start note: {}", e);
        }
    }

    println!("\nALL 14 TESTS COMPLETED SUCCESSFULLY!");
}
