import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-textPrimary/20 backdrop-blur-sm transition-opacity"
        onClick={handleImmediateRedirect}
      />

      {/* Minimal Card */}
      <div
        className="relative bg-surface border border-border/80 rounded-2xl shadow-sheet max-w-sm w-full p-5 text-center animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={handleImmediateRedirect}
          className="absolute top-3.5 right-3.5 text-textMuted hover:text-textPrimary transition-colors p-1 rounded-md"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Minimal indicator */}
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </div>

        <h3 className="text-base font-semibold text-textPrimary tracking-tight">
          Review in Progress
        </h3>

        <p className="text-xs text-textSecondary mt-2 leading-relaxed">
          {dealName ? (
            <>Review for this call of <strong className="text-textPrimary">{dealName}</strong> is going on and will be available once it&apos;s complete.</>
          ) : (
            <>Review for this call is going on and will be available once it&apos;s complete.</>
          )}
        </p>
      </div>
    </div>
  );
}
