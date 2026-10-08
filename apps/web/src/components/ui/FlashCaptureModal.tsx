import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';

interface FlashCaptureModalProps {
  open: boolean;
  dealName?: string;
  targetPath?: string;
  onDismiss?: () => void;
}

export function FlashCaptureModal({
  open,
  dealName,
  targetPath = '/app/dashboard',
  onDismiss,
}: FlashCaptureModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
      navigate(targetPath);
    }, 1500);

    return () => clearTimeout(timer);
  }, [open, targetPath, navigate, onDismiss]);

  if (!open) return null;

  function handleImmediateRedirect() {
    if (onDismiss) onDismiss();
    navigate(targetPath);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-textPrimary/25 backdrop-blur-sm transition-opacity"
        onClick={handleImmediateRedirect}
      />

      {/* Card */}
      <div
        className="relative bg-surface border border-border/80 rounded-2xl shadow-sheet max-w-sm w-full p-6 text-center animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        {/* Pulsing check badge */}
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 animate-pulse" />
        </div>

        <h3 className="text-lg font-semibold text-textPrimary tracking-tight">
          Call Captured
        </h3>

        <p className="text-sm text-textSecondary mt-2 leading-relaxed">
          {dealName ? (
            <>Kairo is analyzing 5-pillar intelligence for <strong className="text-textPrimary">{dealName}</strong> in the background.</>
          ) : (
            <>Kairo is analyzing 5-pillar deal intelligence in the background.</>
          )}
        </p>

        <p className="text-xs text-textMuted mt-1">
          You will receive an alert as soon as the review is ready.
        </p>

        {/* Action Button */}
        <div className="mt-5">
          <button
            onClick={handleImmediateRedirect}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surfaceHigh hover:bg-border/60 text-textPrimary text-sm font-medium transition-colors border border-border"
          >
            <span>Continue to Dashboard</span>
            <ArrowRight className="w-4 h-4 text-textMuted" />
          </button>
        </div>

        {/* Subtle timed progress bar indicator */}
        <div className="w-full bg-border/40 h-1 rounded-full mt-4 overflow-hidden">
          <div className="bg-emerald-500 h-full w-full animate-[shrink_1.5s_linear_forwards]" />
        </div>
      </div>
    </div>
  );
}
