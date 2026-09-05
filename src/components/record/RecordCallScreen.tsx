import React, { useState } from 'react';
import { Pause, Play, Square, Trash2, X, AlertCircle, Mic } from 'lucide-react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { submitRecording } from '../../lib/kairo';
import { cn } from '../../lib/utils';
import { LoadingState } from '../ui/LoadingState';

interface PendingDealForm {
  dealName: string;
  companyName: string;
  dealStage: string;
  dealValue: string;
}

interface RecordCallScreenProps {
  // Existing-deal path (Call Review -> Record Now): dealId already known,
  // no deal gets created.
  dealId?: string;
  // New-deal path (New Deal -> Record Now): no deal exists yet -- the
  // deal is created from this form state before the conversation row.
  pendingDealForm?: PendingDealForm;
  // Called once mobile-recording-review has finished successfully.
  onComplete: (result: { conversationId: string; dealId: string }) => void;
  onClose: () => void;
  // Only used on the New Deal path -- creates the deal row and returns
  // its id. Left as an injected callback rather than importing
  // createDealRow directly, so this component doesn't need to know
  // anything about NewDeal's form/user state.
  createDeal?: () => Promise<string | null>;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

type SubmitPhase = 'idle' | 'uploading' | 'transcribing' | 'error';

export function RecordCallScreen({ dealId, pendingDealForm, onComplete, onClose, createDeal }: RecordCallScreenProps) {
  const { status, elapsedMs, levels, start, pause, resume, stop, discard, errorMessage } = useAudioRecorder();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isRequesting = status === 'requesting';
  const isSubmitting = submitPhase === 'uploading' || submitPhase === 'transcribing';

  async function handleStop() {
    const result = await stop();
    if (!result) {
      setSubmitPhase('error');
      setSubmitError('We didn\'t capture any audio. Please try recording again.');
      return;
    }

    setSubmitPhase('uploading');
    setSubmitError(null);

    try {
      let targetDealId = dealId;
      if (!targetDealId && createDeal) {
        targetDealId = (await createDeal()) || undefined;
      }
      if (!targetDealId) {
        throw new Error('Could not create the deal. Please check the details and try again.');
      }

      setSubmitPhase('transcribing');
      const outcome = await submitRecording(targetDealId, result.blob, result.mimeType);
      onComplete(outcome);
    } catch (err: any) {
      setSubmitPhase('error');
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
    }
  }

  function handleDiscardConfirmed() {
    discard();
    onClose();
  }

  // ---- Processing (post-stop) screen -----------------------------
  if (isSubmitting) {
    return (
      <div className="fixed inset-0 z-50 bg-bg">
        <LoadingState phase="recording" />
      </div>
    );
  }

  if (submitPhase === 'error' && submitError) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mb-6">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-textPrimary font-display font-semibold text-lg mb-2">Couldn't process that recording</p>
        <p className="text-textSecondary text-sm max-w-xs mb-8">{submitError}</p>
        <button
          onClick={onClose}
          className="text-primary text-sm font-medium"
        >
          Back
        </button>
      </div>
    );
  }

  // ---- Mic permission denied / unsupported browser ----------------
  if (status === 'denied' || status === 'error') {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-6">
          <Mic className="w-6 h-6 text-amber-400" />
        </div>
        <p className="text-textPrimary font-display font-semibold text-lg mb-2">Can't start recording</p>
        <p className="text-textSecondary text-sm max-w-xs mb-8">{errorMessage}</p>
        <button onClick={onClose} className="text-primary text-sm font-medium">
          Go back
        </button>
      </div>
    );
  }

  // ---- Discard confirmation overlay --------------------------------
  if (confirmingDiscard) {
    return (
      <div className="fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-textPrimary font-display font-semibold text-lg mb-2">Discard this recording?</p>
        <p className="text-textSecondary text-sm max-w-xs mb-8">
          This can't be undone. The call won't be saved or reviewed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmingDiscard(false)}
            className="px-5 py-2.5 rounded-lg bg-surface border border-border text-textSecondary text-sm font-medium hover:text-white hover:border-accent/50 transition-all"
          >
            Keep Recording
          </button>
          <button
            onClick={handleDiscardConfirmed}
            className="px-5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  // ---- Main recording screen ---------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center px-6 pt-24 pb-24 md:pt-0 md:pb-0 md:justify-center">
      <div className="flex-1 md:flex-none flex flex-col items-center justify-center">
        {/* Live waveform with pulsating glow behind it */}
        <div className="relative flex items-center justify-center mb-8">
          <div
            className={cn(
              'absolute w-64 h-24 rounded-full',
              isRecording && 'animate-pulse-soft'
            )}
            style={{
              background: 'radial-gradient(ellipse, rgba(205,184,255,0.18) 0%, rgba(205,184,255,0) 70%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-[3px] h-14 w-full max-w-xs">
            {levels.map((level, i) => (
              <div
                key={i}
                className={cn(
                  'w-[3px] rounded-full flex-shrink-0 transition-colors duration-300',
                  isRecording ? 'bg-primary' : 'bg-textMuted'
                )}
                style={{
                  height: `${Math.max(6, level * 100)}%`,
                  opacity: isPaused ? 0.35 : 1,
                }}
              />
            ))}
          </div>
        </div>

        <p className={cn(
          'text-sm font-medium mb-4 tracking-wide',
          isRecording ? 'text-textPrimary' : 'text-textSecondary'
        )}>
          {isRequesting ? 'Waiting for microphone access...' : isPaused ? 'Paused' : 'Recording...'}
        </p>

        <p className="font-mono text-4xl text-textPrimary tabular-nums">
          {formatElapsed(elapsedMs)}
        </p>
      </div>

      {/* Controls -- pinned toward the bottom via the flex-1 spacer above,
          with extra bottom padding on mobile specifically (pb-12 vs the
          md:pb-0 + md:justify-center centered layout on desktop). */}
      <div className="flex items-center gap-6 mb-10">
        <button
          onClick={isPaused ? resume : pause}
          disabled={isRequesting}
          aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
          className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center text-textSecondary hover:text-white hover:border-accent/50 transition-all active:scale-95 disabled:opacity-40"
        >
          {isPaused ? <Play className="w-5 h-5 ml-0.5" /> : <Pause className="w-5 h-5" />}
        </button>

        <button
          onClick={handleStop}
          disabled={isRequesting}
          aria-label="Stop recording"
          className="w-16 h-16 rounded-full bg-primary hover:bg-primaryLight text-white flex items-center justify-center shadow-purple-glow transition-all active:scale-95 disabled:opacity-40"
        >
          <Square className="w-5 h-5" fill="currentColor" />
        </button>

        <button
          onClick={() => setConfirmingDiscard(true)}
          aria-label="Discard recording"
          className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center text-textSecondary hover:text-white hover:border-accent/50 transition-all active:scale-95"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <button
        onClick={() => setConfirmingDiscard(true)}
        aria-label="Close"
        className="absolute top-6 right-6 w-9 h-9 rounded-full flex items-center justify-center text-textMuted hover:text-white hover:bg-surfaceHigh transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}