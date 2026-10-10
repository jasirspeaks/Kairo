import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';

interface FlashCaptureModalProps {
  open: boolean;
  dealName?: string;
  targetPath?: string;
  durationMs?: number;
  onDismiss?: () => void;
}

export function FlashCaptureModal({
  open,
  dealName,
  targetPath = '/app/dashboard',
  durationMs = 4000,
  onDismiss,
}: FlashCaptureModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
      navigate(targetPath);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [open, targetPath, navigate, onDismiss, durationMs]);

  if (!open) return null;

  function handleImmediateRedirect() {
    if (onDismiss) onDismiss();
    navigate(targetPath);
  }

  return (
    <>
      {/* Dim backdrop to focus attention */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={handleImmediateRedirect}
      />

      {/* Mobile Screen: Top Floating Island Banner */}
      <div className="fixed top-3 inset-x-3 z-50 pointer-events-none md:hidden animate-slide-down">
        <div
          onClick={handleImmediateRedirect}
          className="pointer-events-auto cursor-pointer w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)] rounded-2xl p-4 flex flex-col gap-2 select-none"
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-textPrimary tracking-tight">
              Review in Progress
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleImmediateRedirect();
              }}
              className="text-textMuted hover:text-textPrimary transition-colors p-1 -mr-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-textSecondary leading-relaxed">
            {dealName ? (
              <>Review for this call of <strong className="text-textPrimary font-semibold">{dealName}</strong> is in progress and will be available once complete.</>
            ) : (
              'Review for this call is in progress and will be available once complete.'
            )}
          </p>

          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary">
            <span>Go to Deal Review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Desktop Screen: Bottom-Right System Notification Banner */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 pointer-events-none max-w-sm w-full animate-slide-up">
        <div
          onClick={handleImmediateRedirect}
          className="pointer-events-auto cursor-pointer w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)] rounded-2xl p-4 flex flex-col gap-2 select-none"
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-textPrimary tracking-tight">
              Review in Progress
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleImmediateRedirect();
              }}
              className="text-textMuted hover:text-textPrimary transition-colors p-1 rounded-full hover:bg-surfaceHigh -mr-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-textSecondary leading-relaxed">
            {dealName ? (
              <>Review for this call of <strong className="text-textPrimary font-semibold">{dealName}</strong> is in progress and will be available once complete.</>
            ) : (
              'Review for this call is in progress and will be available once complete.'
            )}
          </p>

          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <span>Go to Deal Review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </>
  );
}
