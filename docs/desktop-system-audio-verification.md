# Kairo Desktop System Audio Loopback Verification Procedure

This document describes the manual developer verification procedure for confirming genuine Windows system-audio loopback capture alongside microphone recording in the Kairo Desktop application.

## Overview

Kairo Desktop records two audio channels for deal intelligence:
1. **Microphone Capture**: Local Account Executive (AE) speech input.
2. **System Audio Loopback**: Remote meeting participant speech playing through the active Windows default playback device (speakers, headphones, Bluetooth headsets) via WASAPI loopback capture (`AUDCLNT_STREAMFLAGS_LOOPBACK`).

Both streams are downmixed to mono, resampled with linear interpolation to canonical 16,000 Hz, synchronized in 20ms time slices with clipping prevention, and written to standard 16-bit PCM WAV files (`TARGET_SAMPLE_RATE = 16000`, `TARGET_CHANNELS = 1`).

---

## Prerequisites

1. **Operating System**: Windows 10 or Windows 11 with active default audio output device.
2. **Kairo Desktop App**: Built and running with native Tauri backend (`apps/desktop`).
3. **Audio Playback Source**: Browser meeting (Google Meet / Zoom / Microsoft Teams) or browser tab playing test dialogue/speech (e.g. YouTube interview).
4. **Microphone**: Working default recording device (internal mic or external headset).

---

## Step-by-Step Verification Procedure

### 1. Launch Kairo Desktop
Start the Kairo desktop application:
```bash
npm run dev --workspace=@kairo/desktop
```
Confirm the recording bar or Review View reports:
- `System Audio: Active` (or `system_audio_supported: true` in `get_capture_capabilities`).

### 2. Start Remote Meeting / Audio Source
- Open a meeting in Google Meet, Zoom, or Teams, or play a speech test audio track in Chrome/Edge.
- Ensure audio is playing audibly through your Windows default output device (speakers or headphones).

### 3. Start Kairo Recording
- In Kairo Desktop, select a deal and click **Start Meeting Capture** (or press the record hotkey).
- Observe that the capture engine transitions to `status: "recording"`.

### 4. Perform Dual-Voice Dialogue Test
- **AE Speech (Mic)**: Speak a clear test sentence into your microphone (e.g. *"This is the account executive speaking about the proposal timeline."*).
- **Remote Speech (System Audio)**: Ensure the remote participant (or video) speaks concurrently (e.g. *"Here is the client asking about security compliance."*).

### 5. Pause & Resume Check (Optional)
- Click **Pause Capture**; verify timer stops and level meter pauses.
- Click **Resume Capture**; verify timer continues without time drift.

### 6. Stop and Finalize Recording
- Click **Stop Recording**.
- Verify that `stop_meeting_capture` returns:
  - `duration_seconds > 0`
  - `file_size_bytes > 44` (valid non-empty WAV header and data frames)
  - `sample_rate: 16000`
  - `channels: 1`
  - `capture_source: "combined"` (or `"system_audio"` / `"microphone"` depending on selected mode)

### 7. Inspect Output Audio
- Navigate to the temporary capture directory (e.g., `%TEMP%\kairo_captures\kairo_meeting_<id>_<timestamp>.wav`).
- Play back the `.wav` file in VLC, Windows Media Player, or Audacity:
  - **Confirm local microphone speech is clear and present.**
  - **Confirm remote/system playback speech is clear and present.**
  - **Confirm both speakers are blended without digital clipping, distortion, or silence gaps.**

### 8. Upload & Downstream Pipeline Verification
- Allow Kairo Desktop to submit the recorded WAV file to the transcription and review pipeline (`mobile-recording-review` or local review pipeline).
- Confirm the transcript contains segments from both the local AE and the remote prospect.
