# Kairo Desktop Windows System Audio (WASAPI Loopback) Verification Guide

This document describes the exact verification procedure for confirming genuine Windows WASAPI loopback system-audio capture alongside local microphone recording in Kairo Desktop.

---

## Technical Overview

Kairo Desktop records two distinct audio pathways:
1. **MicrophoneCapture**: Account Executive (AE) local speech captured through CPAL default input stream.
2. **SystemLoopbackCapture**: Remote participant speech captured through Windows Core Audio WASAPI loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK`) on the default render endpoint (`IMMDeviceEnumerator::GetDefaultAudioEndpoint(eRender, eConsole)`).
3. **CombinedCapture**: Coordinates both streams, converts multi-channel audio to mono (`downmix_interleaved_to_mono`), resamples via linear interpolation to canonical 16,000 Hz (`resample_linear`), synchronizes both streams in 20ms chunks, applies soft limiting (`mix_samples`) to prevent digital clipping, and writes standard 16-bit PCM WAV (`TARGET_SAMPLE_RATE = 16000`, `TARGET_CHANNELS = 1`).

---

## Capability Detection Semantics

In Kairo Desktop, `capabilities.system_audio_supported` does **NOT** mean "Windows has an audio device".
It specifically means:
> **The native Windows WASAPI loopback engine has successfully initialized COM, enumerated the default render endpoint, activated `IAudioClient`, and verified that loopback capture is accessible on this system.**

On non-Windows platforms, or if Windows Core Audio is unavailable, `system_audio_supported` evaluates to `false` and the UI explicitly indicates `System Audio: OS Unsupported`.

---

## 12-Step Manual Verification Procedure

Follow these exact steps on Windows:

1. **Run Kairo Desktop on Windows**:
   Start the application in dev mode:
   ```bash
   npm run dev --workspace=@kairo/desktop
   ```
   Verify that the header badge reports:
   - `Mic: Active` (`microphone_supported: true`)
   - `System Audio: Active` (`system_audio_supported: true`)

2. **Connect Headphones**:
   Plug in standard 3.5mm wired headphones, USB headset, or connect Bluetooth headphones/AirPods.

3. **Make Headphones the Windows Default Playback Device**:
   - Open Windows Settings > System > Sound.
   - Under **Choose where to play sound**, select your connected headphones.
   - Confirm system sounds and test chimes are heard exclusively inside the headphones.

4. **Start Remote Audio Source**:
   - Open a live Google Meet, Zoom, or Microsoft Teams call with a colleague, OR open a browser tab playing dialogue/speech (e.g., YouTube interview or podcast).

5. **Ensure Audio is Actively Playing**:
   Confirm you clearly hear speech inside your headphones.

6. **Start Kairo Recording**:
   - In Kairo Desktop, select a deal or meeting and click **Start Meeting Capture** (or press the record hotkey).
   - Observe status transitions to `recording` and elapsed time starts incrementing.

7. **Speak into the Microphone**:
   - Speak a clear test sentence (e.g., *"This is the account executive reviewing pricing."*).

8. **Receive Speech Through the Windows Playback Device**:
   - Ensure the remote participant speaks concurrently (e.g., *"We require SOC2 compliance by next quarter."*).

9. **Stop Kairo Recording**:
   - Click **Stop Recording**.
   - Verify that `stop_meeting_capture` returns:
     - `duration_seconds > 0`
     - `file_size_bytes > 44` (valid non-empty PCM data)
     - `sample_rate: 16000`
     - `channels: 1`
     - `capture_source: "combined"`

10. **Inspect Resulting Audio File**:
    - Locate the generated WAV file in `%TEMP%\kairo_captures\kairo_meeting_<id>_<timestamp>.wav`.
    - Open the file in an audio editor/player (Audacity, VLC, or Windows Media Player).

11. **Confirm Presence of Both Speakers**:
    - **Local AE Voice**: Confirm clear, crisp microphone speech is present.
    - **Remote Participant Voice**: Confirm the remote audio playing through the headphones is present at full digital fidelity.
    - Confirm both audio tracks are balanced without clipping, distortion, or silence gaps.

12. **Run Normal Kairo Upload & Transcription Path**:
    - In Kairo Desktop, submit the completed recording to the review/transcription pipeline.
    - Confirm the generated transcript contains speech segments and speaker labels for both the local AE and the remote prospect.

---

## Proving Loopback Capture vs. Microphone Bleed

To definitively prove that the remote audio is captured directly from the Windows WASAPI loopback stream rather than leaking acoustically into the microphone:

### Proof Test A: Hardware Microphone Mute / Silence
1. Set capture source to `system_audio` (or mute your physical microphone).
2. Play audio strictly through your headphones.
3. Stop recording and play back the resulting `.wav`.
4. **Observation**: The remote audio is crystal clear with zero background ambient noise. Since the microphone was muted, acoustic bleed is physically impossible; the audio could only have been captured by the WASAPI loopback stream (`AUDCLNT_STREAMFLAGS_LOOPBACK`).

### Proof Test B: Closed-Ear Headphone Isolation
1. Wear closed-back headphones or in-ear monitors with the volume set to a moderate level.
2. In a quiet room, ensure external sound escaping the earcups is undetectable to human ears (SPL < 20 dB).
3. Record while receiving remote speech.
4. **Observation**: In the recorded `.wav`, the remote audio is captured at full dynamic range (0 dBFS normalized), mathematically proving it is sourced directly from the Windows audio render buffer prior to DAC output.

---

## Automated Verification Suite

Run the automated verification suite to validate all Core Audio and WASAPI loopback components:

```powershell
cargo run --bin test_audio
```

Expected output:
```
=== RUNNING KAIRO AUDIO CAPTURE VERIFICATION SUITE ===
[TEST 1/13] WASAPI loopback capability: true
[TEST 2/13] Capability check matches WASAPI loopback status: PASS
[TEST 3/13] Format determination (IEEE Float): PASS
[TEST 4/13] Format determination (PCM 16-bit): PASS
[TEST 5/13] Format determination (PCM 32-bit): PASS
[TEST 6/13] Format determination (Extensible Float & PCM): PASS
[TEST 7/13] Sample conversion (Float32 passthrough): PASS
[TEST 8/13] Sample conversion (Int16 to Float32 normalized): PASS
[TEST 9/13] Silent buffer handling (AUDCLNT_BUFFERFLAGS_SILENT): PASS
[TEST 10/13] Channel downmix (Stereo to Mono): PASS
[TEST 11/13] Channel downmix (5.1 Surround to Mono): PASS
[TEST 12/13] Linear resampler (48kHz -> 16kHz): PASS
[TEST 13/14] Mixer queue drain and WAV output: PASS
[TEST 14/14] Testing real Windows WASAPI loopback capture lifecycle...
[KairoWASAPI] Loopback capture successfully initialized: 48000Hz, 2 channels, Float32 (32-bit)
  -> Stream started successfully via IAudioClient with AUDCLNT_STREAMFLAGS_LOOPBACK!
  -> Stream stopped and cleaned up cleanly!
[TEST 14/14] Real Windows WASAPI loopback capture lifecycle: PASS

ALL 14 TESTS COMPLETED SUCCESSFULLY!
```
