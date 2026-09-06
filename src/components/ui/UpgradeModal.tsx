import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { Button } from './Button';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

// Fires only when someone clicks a write action (New Deal's three
// buttons, Add Call, Record Now, Schedule Next Meeting) while the
// account can't write. There is deliberately no static indicator
// anywhere else -- every button looks and behaves normally until
// clicked, and this is the only surface that tells the person why
// nothing happened.
//
// Copy avoids the words "read-only" / "locked" on purpose -- the
// person will discover that intuitively (nothing they try to add
// goes through); this just needs to explain why and point at the fix.
export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleUpgrade() {
    onClose();
    navigate('/app/settings?upgrade=1');
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
        {/* Drag handle -- mobile only, matches BottomSheet's convention */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-6 pt-4 pb-6 md:pt-7 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-textPrimary mb-1.5">
            Trial ended
          </h2>
          <p className="text-textSecondary text-sm leading-relaxed mb-6">
            Upgrade to continue using Kairo.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={handleUpgrade} size="lg" className="w-full">
              Upgrade
            </Button>
            <button
              onClick={onClose}
              className="text-textMuted hover:text-textSecondary text-xs font-medium py-2 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}