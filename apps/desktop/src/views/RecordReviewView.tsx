import React, { useState, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calendar,
  Building2,
  Clock,
  Play,
  Pause,
  Trash2,
} from 'lucide-react';
import { useAuth, getDeals, getMeetings, submitRecording, updateMeetingCaptureStatus } from '@kairo/api';
import { Deal, MeetingWithDeal } from '@kairo/core';
import { useMeetingCapture, getNativeCaptureCapabilities, NativeCaptureCapabilities } from '@kairo/platform';

export function RecordReviewView() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithDeal[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capabilities, setCapabilities] = useState<NativeCaptureCapabilities | null>(null);

  const capture = useMeetingCapture();

  useEffect(() => {
    getNativeCaptureCapabilities().then(setCapabilities).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      getDeals(user.id).then((data) => {
        setDeals(data);
        if (data.length > 0 && !selectedDealId) {
          setSelectedDealId(data[0].id);
        }
      });

      getMeetings(user.id, { upcomingOnly: true, limit: 10 }).then((data) => {
        setMeetings(data);
        if (data.length > 0 && !selectedMeetingId) {
          setSelectedMeetingId(data[0].id);
          if (data[0].deal_id) {
            setSelectedDealId(data[0].deal_id);
          }
        }
      });
    }
  }, [user]);

  const handleMeetingSelect = (meetingId: string) => {
    setSelectedMeetingId(meetingId);
    const meeting = meetings.find((m) => m.id === meetingId);
    if (meeting?.deal_id) {
      setSelectedDealId(meeting.deal_id);
    }
  };

  const handleStart = async () => {
    setStatusMessage(null);
    setSuccessMessage(null);

    const meetingId = selectedMeetingId || `ad_hoc_${Date.now()}`;
    await capture.startCapture(meetingId, selectedDealId || null);

    if (selectedMeetingId) {
      await updateMeetingCaptureStatus(selectedMeetingId, 'recording');
    }
  };

  const handleStopAndProcess = async () => {
    if (!selectedDealId) {
      setStatusMessage('Please select an associated deal before processing.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    setSuccessMessage(null);

    try {
      const res = await capture.stopCapture();
      if (!res) {
        setStatusMessage('Recording was empty or could not be finalized.');
        return;
      }

      if (selectedMeetingId) {
        await updateMeetingCaptureStatus(selectedMeetingId, 'processing');
      }

      if (res.blob) {
        await submitRecording(selectedDealId, res.blob, res.mimeType, selectedMeetingId || null);
      }

      if (selectedMeetingId) {
        await updateMeetingCaptureStatus(selectedMeetingId, 'completed');
      }

      setSuccessMessage('Meeting captured and 5-pillar deal intelligence generated successfully!');
    } catch (err: any) {
      setStatusMessage(err?.message || 'Failed to process intelligence for recording.');
      if (selectedMeetingId) {
        await updateMeetingCaptureStatus(selectedMeetingId, 'failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSeconds = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6 max-w-4xl mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-textPrimary font-display">
            Meeting Capture & Deal Intelligence
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Dual-channel desktop audio engine spools meeting conversation directly into Kairo's 5-pillar qualification model
          </p>
        </div>
        {capabilities && (
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
              capabilities.microphone_supported
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {capabilities.microphone_supported ? 'Mic: Active' : 'Mic: Missing'}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
              capabilities.system_audio_supported
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-surfaceHigh text-textMuted border-border'
            }`}>
              {capabilities.system_audio_supported ? 'System Audio: Active' : 'System Audio: OS Unsupported'}
            </span>
          </div>
        )}
      </div>

      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {(capture.errorMessage || statusMessage) && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{capture.errorMessage || statusMessage}</span>
        </div>
      )}

      {/* Upcoming Scheduled Meetings Selector */}
      {meetings.length > 0 && (
        <div className="card p-5 flex flex-col gap-3 border-primary/20 bg-surfaceHigh/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-textPrimary flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              Scheduled Meetings
            </span>
            <span className="text-[11px] text-textMuted font-mono">
              Auto-linked to Deals
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {meetings.map((m) => {
              const isSelected = selectedMeetingId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleMeetingSelect(m.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border bg-surfaceHigh hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-textPrimary truncate">{m.title}</p>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-surface border border-border text-textMuted">
                      {m.capture_status}
                    </span>
                  </div>
                  {m.deal_name && (
                    <p className="text-[11px] text-textSecondary flex items-center gap-1 mt-1 truncate">
                      <Building2 className="w-3 h-3 text-primary" />
                      {m.deal_name} {m.company_name ? `(${m.company_name})` : ''}
                    </p>
                  )}
                  {m.start_time && (
                    <p className="text-[11px] text-textMuted flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(m.start_time).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Target Deal Selection */}
      <div className="card p-5 flex flex-col gap-3">
        <label className="text-xs font-semibold text-textPrimary">
          Associated Opportunity
        </label>
        <select
          value={selectedDealId}
          onChange={(e) => setSelectedDealId(e.target.value)}
          className="input-field text-xs"
        >
          {deals.length === 0 ? (
            <option value="">No deals available</option>
          ) : (
            deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company_name} ({d.deal_name})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Main Recording Console */}
      <div className="card p-8 flex flex-col items-center justify-center gap-6 text-center border-dashed">
        <div className="relative">
          {capture.isCapturing && (
            <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
          )}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all shadow-inner ${
              capture.isCapturing
                ? 'bg-red-500/10 border-red-500 text-red-500'
                : 'bg-surfaceHigh border-border text-textMuted'
            }`}
          >
            <Mic className="w-8 h-8" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="text-2xl font-bold font-mono tracking-wider text-textPrimary">
            {formatSeconds(capture.elapsedMs)}
          </div>
          <span className="text-xs text-textMuted uppercase tracking-widest font-semibold">
            {capture.isCapturing ? (capture.isPaused ? 'Capture Paused' : 'Live Desktop Audio Stream') : 'Capture Engine Ready'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {!capture.isCapturing ? (
            <button
              onClick={handleStart}
              className="btn-primary py-2.5 px-6 flex items-center gap-2 text-xs font-semibold shadow-lg shadow-primary/20"
            >
              <Mic className="w-4 h-4" />
              <span>Start Capture</span>
            </button>
          ) : (
            <>
              {capture.isPaused ? (
                <button
                  onClick={capture.resumeCapture}
                  className="btn-secondary py-2 px-4 flex items-center gap-2 text-xs text-emerald-400 border-emerald-400/30"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={capture.pauseCapture}
                  className="btn-secondary py-2 px-4 flex items-center gap-2 text-xs text-amber-400 border-amber-400/30"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={handleStopAndProcess}
                disabled={isSubmitting}
                className="btn-primary py-2 px-5 flex items-center gap-2 text-xs bg-primary hover:bg-primaryHover text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Deal...</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Finish & Analyze</span>
                  </>
                )}
              </button>

              <button
                onClick={capture.discardCapture}
                disabled={isSubmitting}
                className="btn-secondary py-2 px-3 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
                title="Discard recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
