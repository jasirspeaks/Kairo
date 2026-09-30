import React, { useState, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAudioRecorder } from '@kairo/platform';
import { useAuth, getDeals } from '@kairo/api';
import { Deal } from '@kairo/core';

export function RecordReviewView() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const {
    status,
    elapsedMs,
    levels,
    errorMessage,
    start,
    stop,
  } = useAudioRecorder();

  const isRecording = status === 'recording';

  useEffect(() => {
    if (user) {
      getDeals(user.id).then((data) => {
        setDeals(data);
        if (data.length > 0 && !selectedDealId) {
          setSelectedDealId(data[0].id);
        }
      });
    }
  }, [user]);

  const handleStart = async () => {
    setStatusMessage(null);
    setAudioBlob(null);
    setAudioUrl(null);
    await start();
  };

  const handleStop = async () => {
    const result = await stop();
    if (result?.blob) {
      setAudioBlob(result.blob);
      setAudioUrl(URL.createObjectURL(result.blob));
    }
  };

  const formatSeconds = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentLevel = levels.length > 0 ? levels[levels.length - 1] : 0;

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-textPrimary font-display">
          Record & Review Call
        </h1>
        <p className="text-xs text-textSecondary mt-0.5">
          Capture conversation audio with native desktop microphone processing and AI intelligence extraction
        </p>
      </div>

      {(errorMessage || statusMessage) && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{errorMessage || statusMessage}</span>
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

      {/* Recorder Interface */}
      <div className="card p-8 flex flex-col items-center justify-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? 'bg-rose-500/20 border-2 border-rose-500 animate-pulse shadow-lg shadow-rose-500/20'
                : 'bg-primary/20 border-2 border-primary/40'
            }`}
          >
            {isRecording ? (
              <Square
                onClick={handleStop}
                className="w-8 h-8 text-rose-400 cursor-pointer"
              />
            ) : (
              <Mic
                onClick={handleStart}
                className="w-8 h-8 text-primary cursor-pointer hover:scale-110 transition-transform"
              />
            )}
          </div>

          <div className="text-sm font-semibold font-mono text-textPrimary mt-2">
            {formatSeconds(elapsedMs)}
          </div>
          <p className="text-xs text-textMuted">
            {isRecording ? 'Recording active call audio...' : 'Click microphone to begin desktop recording'}
          </p>
        </div>

        {/* Level visualizer bar */}
        {isRecording && (
          <div className="w-64 h-2 rounded-full bg-surfaceHigh overflow-hidden border border-border">
            <div
              className="h-full bg-emerald-400 transition-all duration-75"
              style={{ width: `${Math.min(100, Math.max(5, currentLevel * 100))}%` }}
            />
          </div>
        )}

        {/* Action button */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button
              onClick={handleStop}
              className="btn-secondary text-xs px-6 py-2.5 flex items-center gap-2 border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Recording</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Start Desktop Recording</span>
            </button>
          )}
        </div>

        {/* Audio playback preview */}
        {audioUrl && !isRecording && (
          <div className="w-full pt-4 border-t border-border flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Capture completed</span>
            </div>
            <audio src={audioUrl} controls className="w-full max-w-md h-10" />
            <button
              onClick={() => setStatusMessage('Ready for edge transcription & AI deal qualification!')}
              className="btn-primary text-xs py-2 px-5 flex items-center gap-2 mt-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Process Call Intelligence</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
