import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { createCheckoutSession } from '../../lib/kairo';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleDirectCheckout() {
    setLoading(true);
    setError('');
    try {
      const { url } = await createCheckoutSession();
      if (url) {
        window.location.assign(url);
      }
    } catch (err: any) {
      console.error('UpgradeModal checkout error:', err);
      setError(err.message || 'Failed to start checkout. Redirecting to settings...');
      setTimeout(() => {
        onClose();
        navigate('/app/settings?upgrade=1');
      }, 1200);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-textPrimary/20 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:right-auto md:bottom-auto
                   md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm
                   bg-surface rounded-t-2xl md:rounded-2xl shadow-sheet
                   pb-safe-b animate-sheet-up md:animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle -- mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-6 pt-4 pb-6 md:pt-7 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-textPrimary mb-1.5">
            Upgrade to Kairo Pro
          </h2>
          <p className="text-textSecondary text-xs leading-relaxed mb-6">
            Get unlimited deal reviews, multi-call longitudinal memory, and deal risk intelligence.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-2.5 mb-4 text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleDirectCheckout}
              loading={loading}
              size="lg"
              className="w-full"
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Upgrade with Stripe
            </Button>
            <button
              onClick={onClose}
              className="text-textMuted hover:text-textSecondary text-xs font-medium py-1.5 transition-colors"
            >
              Not now
            </button>
            <p className="text-[11px] text-textMuted mt-1">
              Payments processed securely by Stripe. View our{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-textSecondary hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}