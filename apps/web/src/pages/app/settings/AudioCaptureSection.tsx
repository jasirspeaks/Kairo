import React, { useEffect, useState } from 'react';
import { Mic, Laptop, Radio, CheckCircle2, AlertCircle, Info, RefreshCw } from 'lucide-react';
import {
  isTauriEnvironment,
  getNativeCaptureCapabilities,
  NativeCaptureCapabilities,
} from '@kairo/platform';
import { AudioCapturePreferences } from '@kairo/core';

interface AudioCaptureSectionProps {
  capturePrefs: AudioCapturePreferences;
  setCapturePrefs: (prefs: AudioCapturePreferences) => void;
}

export function AudioCaptureSection({
  capturePrefs,
  setCapturePrefs,
}: AudioCaptureSectionProps) {
  const isDesktop = isTauriEnvironment();
  const [capabilities, setCapabilities] = useState<NativeCaptureCapabilities | null>(null);
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [webMicAllowed, setWebMicAllowed] = useState<boolean | null>(null);
  const [testingMic, setTestingMic] = useState(false);

  useEffect(() => {
    if (isDesktop) {
      loadDesktopCapabilities();
    } else {
      checkWebMicPermission();
    }
  }, [isDesktop]);

  async function loadDesktopCapabilities() {
    setLoadingCaps(true);
    try {
      const caps = await getNativeCaptureCapabilities();
      setCapabilities(caps);
    } catch (e) {
      console.warn('Failed to query native desktop audio capabilities:', e);
    } finally {
      setLoadingCaps(false);
    }
  }

  async function checkWebMicPermission() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebMicAllowed(false);
      return;
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setWebMicAllowed(res.state === 'granted');
      }
    } catch {
      // Permission query unsupported in some browsers
    }
  }

  async function testWebMic() {
    setTestingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setWebMicAllowed(true);
      // Clean up stream immediately
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setWebMicAllowed(false);
    } finally {
      setTestingMic(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Platform banner */}
      <div className="p-4 rounded-xl bg-surface border border-border flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {isDesktop ? (
            <Laptop className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          ) : (
            <Mic className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-textPrimary">
                {isDesktop ? 'Desktop Native Audio Engine (Tauri)' : 'Web Browser Capture Mode'}
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {isDesktop ? 'Hardware Loopback Enabled' : 'Browser Direct'}
              </span>
            </div>
            <p className="text-textSecondary text-xs mt-1 leading-relaxed">
              {isDesktop
                ? 'Desktop captures both your local microphone and system audio loopback (remote attendees on Zoom, Google Meet, or Teams) directly without requiring third-party bot attendees.'
                : 'Web captures local microphone audio and allows transcript file uploads. For direct prospect loopback recording without meeting bots, use the Kairo Desktop App.'}
            </p>
          </div>
        </div>

        {isDesktop && (
          <button
            type="button"
            onClick={loadDesktopCapabilities}
            disabled={loadingCaps}
            className="text-xs text-textSecondary hover:text-textPrimary p-1.5 rounded-lg border border-border hover:border-accent/40 transition-colors"
            title="Refresh audio hardware"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCaps ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Desktop Audio Hardware Configuration */}
      {isDesktop ? (
        <div className="card p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-textPrimary">Native Capture Settings</h3>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-textSecondary">
              Capture Audio Channel Source
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'combined',
                  title: 'Combined (Recommended)',
                  desc: 'Microphone + Remote System Audio',
                },
                {
                  id: 'microphone',
                  title: 'Microphone Only',
                  desc: 'Local speech only (in-person calls)',
                },
                {
                  id: 'system_audio',
                  title: 'System Loopback Only',
                  desc: 'Speaker/Prospect audio only',
                },
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() =>
                    setCapturePrefs({
                      ...capturePrefs,
                      capture_source: src.id as any,
                    })
                  }
                  className={`text-left p-3 rounded-lg border transition-all ${
                    capturePrefs.capture_source === src.id
                      ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30 text-textPrimary'
                      : 'bg-surfaceHigh border-border text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  <p className="text-xs font-semibold text-textPrimary">{src.title}</p>
                  <p className="text-[11px] text-textMuted mt-0.5">{src.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {capabilities?.available_devices && capabilities.available_devices.length > 0 && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Default Microphone Device
              </label>
              <select
                value={capturePrefs.input_device_name || capabilities.default_device_name || ''}
                onChange={(e) =>
                  setCapturePrefs({
                    ...capturePrefs,
                    input_device_name: e.target.value || null,
                  })
                }
                className="input-field"
              >
                <option value="">System Default Microphone</option>
                {capabilities.available_devices.map((dev) => (
                  <option key={dev} value={dev}>
                    {dev}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Meeting Auto-Detection Watcher */}
          <div className="pt-4 border-t border-border flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-textPrimary">
                Calendar Meeting Auto-Watcher
              </p>
              <p className="text-textMuted text-[11px] mt-0.5">
                Automatically float the Active Meeting Intelligence Bar when a scheduled call begins.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={capturePrefs.auto_capture_enabled}
                onChange={(e) =>
                  setCapturePrefs({
                    ...capturePrefs,
                    auto_capture_enabled: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surfaceHigh border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      ) : (
        /* Web Microphone Permissions and Upload */
        <div className="card p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-textPrimary">Browser Microphone Access</h3>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-lg bg-surfaceHigh border border-border">
            <div className="flex items-center gap-2.5">
              {webMicAllowed === true ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : webMicAllowed === false ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : (
                <Info className="w-4 h-4 text-textMuted" />
              )}
              <div>
                <p className="text-xs font-medium text-textPrimary">
                  {webMicAllowed === true
                    ? 'Microphone Permission Granted'
                    : webMicAllowed === false
                    ? 'Microphone Not Granted or Blocked'
                    : 'Permission Not Yet Requested'}
                </p>
                <p className="text-[11px] text-textMuted">
                  Required for in-browser recording of live meetings.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={testWebMic}
              disabled={testingMic}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-accent/40 text-textPrimary transition-colors"
            >
              {testingMic ? 'Testing…' : 'Test Mic'}
            </button>
          </div>
        </div>
      )}

      {/* 48-Hour Retention Assurance */}
      <div className="p-4 rounded-xl bg-surfaceSecondary/50 border border-border flex items-start gap-3">
        <Info className="w-4 h-4 text-textMuted flex-shrink-0 mt-0.5" />
        <div className="text-xs text-textSecondary space-y-1">
          <p className="font-semibold text-textPrimary">48-Hour Automated Audio Purge Policy</p>
          <p className="text-textMuted leading-relaxed">
            Raw audio files are automatically purged from secure storage within 48 hours of transcription. Once analyzed, Kairo retains only the text transcript and structured deal evidence in your database.
          </p>
        </div>
      </div>
    </div>
  );
}
