import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';

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

      {/* Floating System Notification Banner (Desktop: Bottom-Right, Mobile: Top) */}
      {/* Mobile Screen: Top Floating Island Banner */}
      <div className="fixed top-3 inset-x-3 z-50 pointer-events-none md:hidden animate-slide-down">
        <div
          onClick={handleImmediateRedirect}
          className="pointer-events-auto cursor-pointer w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)] rounded-3xl p-3.5 flex items-center gap-3 select-none"
          role="button"
          tabIndex={0}
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(112,66,197,0.35)]">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-textMuted bg-surfaceSecondary px-1.5 py-0.5 rounded border border-border/50">
                  KAIRO
                </span>
                <span className="text-[10px] text-textMuted font-mono">· NOW</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleImmediateRedirect();
                }}
                className="text-textMuted hover:text-textPrimary transition-colors p-1"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <h4 className="text-xs font-semibold text-textPrimary tracking-tight">Review in Progress</h4>
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                live
              </span>
            </div>

            <p className="text-xs text-textSecondary mt-0.5 leading-relaxed line-clamp-2">
              {dealName ? (
                <>Review for this call of <strong className="text-textPrimary">{dealName}</strong> is going on and will be available once it&apos;s complete.</>
              ) : (
                <>Review for this call is going on and will be available once it&apos;s complete.</>
              )}
            </p>

            <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
              <span>Go to Deal Review</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Screen: Bottom-Right System Notification Banner */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 pointer-events-none max-w-sm w-full animate-slide-up">
        <div
          onClick={handleImmediateRedirect}
          className="pointer-events-auto cursor-pointer w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)] rounded-2xl p-4 flex items-start gap-3.5 select-none hover:border-primaryLight transition-all"
          role="button"
          tabIndex={0}
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(112,66,197,0.35)] mt-0.5">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-textMuted bg-surfaceSecondary px-1.5 py-0.5 rounded border border-border/50">
                  KAIRO
                </span>
                <span className="text-[10px] text-textMuted font-mono">· NOW</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleImmediateRedirect();
                }}
                className="text-textMuted hover:text-textPrimary transition-colors p-1 rounded-full hover:bg-surfaceHigh -mr-1"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <h4 className="text-xs font-semibold text-textPrimary tracking-tight">Review in Progress</h4>
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                live
              </span>
            </div>

            <p className="text-xs text-textSecondary mt-0.5 leading-relaxed">
              {dealName ? (
                <>Review for this call of <strong className="text-textPrimary">{dealName}</strong> is going on and will be available once it&apos;s complete.</>
              ) : (
                <>Review for this call is going on and will be available once it&apos;s complete.</>
              )}
            </p>

            <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary">
              <span>Go to Deal Review</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
