import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  Sparkles,
  Loader2,
  Calendar,
  Building2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { MeetingWithDeal } from '@kairo/core';

interface ActiveMeetingBarProps {
  meeting: MeetingWithDeal | null;
  dealName?: string;
  companyName?: string;
  isCapturing: boolean;
  isPaused: boolean;
  captureStatus: string;
  elapsedMs: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
}

export function ActiveMeetingBar({
  meeting,
  dealName,
  companyName,
  isCapturing,
  isPaused,
  captureStatus,
  elapsedMs,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: ActiveMeetingBarProps) {
  const navigate = useNavigate();

  if (!meeting && !isCapturing && captureStatus === 'idle') {
    return null;
  }

  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isProcessing = captureStatus === 'uploading' || captureStatus === 'processing';
  const isUnassigned = captureStatus === 'unassigned' || (!meeting?.deal_id && !isCapturing);

  return (
    <div className="bg-surfaceHigh/90 backdrop-blur-md border-b border-primary/30 px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50 animate-slide-down">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2">
          {isCapturing && !isPaused && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          )}
          {isPaused && <span className="h-3 w-3 rounded-full bg-amber-400" />}
          {isProcessing && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
          {captureStatus === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {captureStatus === 'failed' && <span className="h-3 w-3 rounded-full bg-red-500" />}
          {isUnassigned && <span className="h-3 w-3 rounded-full bg-violet-400" />}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-textPrimary">
              {captureStatus === 'recording' && 'Auto-Capturing Meeting'}
              {captureStatus === 'paused' && 'Capture Paused'}
              {captureStatus === 'uploading' && 'Uploading Spooled Audio...'}
              {captureStatus === 'processing' && 'Running 5-Pillar Deal Intelligence...'}
              {captureStatus === 'completed' && 'Review Complete'}
              {captureStatus === 'failed' && 'Capture / Processing Failed'}
              {captureStatus === 'approaching' && 'Meeting Approaching'}
              {isUnassigned && 'Meeting Approaching (Unassigned)'}
              {captureStatus === 'idle' && !isUnassigned && 'Meeting Approaching'}
            </span>
            {isCapturing && (
              <span className="font-mono text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {formatElapsed(elapsedMs)}
              </span>
            )}
          </div>
        </div>

        <div className="h-4 w-[1px] bg-border" />

        <div className="flex items-center gap-3 truncate">
          <span className="text-xs font-medium text-textPrimary truncate">
            {meeting?.title || 'Active Sales Conversation'}
          </span>
          {(dealName || meeting?.deal_name) ? (
            <span className="text-xs text-textMuted flex items-center gap-1">
              <Building2 className="w-3 h-3 text-primary" />
              {dealName || meeting?.deal_name}
              {(companyName || meeting?.company_name) && ` (${companyName || meeting?.company_name})`}
            </span>
          ) : isUnassigned ? (
            <span className="text-xs text-violet-400 font-medium">
              Assign to a deal in Inbox to enable Auto-Capture
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isUnassigned && !isCapturing && (
          <button
            onClick={() => navigate('/app/inbox')}
            className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5 bg-primary hover:bg-primaryHover text-white"
            title="Assign deal in Inbox"
          >
            <span>Assign in Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {isCapturing && (
          <>
            {isPaused ? (
              <button
                onClick={onResume}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
                title="Resume capture"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                title="Pause capture"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            )}

            <button
              onClick={onStop}
              className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5 bg-primary hover:bg-primaryHover text-white"
              title="Stop and process intelligence"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Finish & Analyze</span>
            </button>

            <button
              onClick={onDiscard}
              className="btn-secondary text-xs py-1 px-2 text-red-400 border-red-400/30 hover:bg-red-400/10"
              title="Discard recording"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
