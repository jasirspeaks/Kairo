import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from './Button';

interface DeleteAccountModalProps {
  open: boolean;
  email: string;
  onClose: () => void;
}

// Mirrors UpgradeModal's shell exactly (bottom sheet on mobile, centered
// dialog on desktop, Escape + backdrop to dismiss) so the app has one
// consistent modal pattern rather than a one-off for this flow.
//
// The typed-email requirement is intentional friction, not decoration --
// this is the single most destructive action in the product (irreversible,
// wipes every deal/call/transcript) and a misclick on a plain "Delete"
// button is a realistic failure mode a checkbox wouldn't stop. The server
// re-checks this same confirmation independently (see delete-account),
// so this isn't the only thing standing between a click and deletion --
// it's the deliberate speed bump before the request is even sent.
export function DeleteAccountModal({ open, email, onClose }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmText('');
    setError(null);
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !deleting) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const matches = confirmText.trim().toLowerCase() === email.trim().toLowerCase();

  async function handleDelete() {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session expired — refresh the page and try again.');
        setDeleting(false);
        return;
      }

      const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirm_email: email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong deleting your account. Please try again.');
        setDeleting(false);
        return;
      }

      // Account is gone server-side. Clear the local session and send
      // them to sign-in -- there's no account left to route back to.
      await supabase.auth.signOut();
      window.location.href = '/signin';
    } catch {
      setError('Network error. Please try again.');
      setDeleting(false);
    }
  }

  function handleClose() {
    if (deleting) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-textPrimary/20 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="absolute bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:right-auto md:bottom-auto
                   md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-sm
                   bg-surface rounded-t-2xl md:rounded-2xl shadow-sheet
                   pb-safe-b animate-sheet-up md:animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-6 pt-4 pb-6 md:pt-7">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h2 id="delete-account-title" className="text-lg font-display font-bold text-textPrimary mb-1.5 text-center">
            Delete your account
          </h2>
          <p className="text-textSecondary text-sm leading-relaxed mb-4 text-center">
            This permanently deletes every deal, call, transcript, and stakeholder record in Kairo, and disconnects Calendar and Fireflies. This cannot be undone.
          </p>
          <p className="text-textMuted text-xs leading-relaxed mb-5 text-center">
            Your Fireflies account and its recordings are managed separately and are not affected.
          </p>

          <label className="block text-xs font-medium text-textSecondary mb-1.5">
            Type <span className="font-mono text-textPrimary">{email}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={email}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={deleting}
            className="input-field font-mono text-xs mb-4 disabled:opacity-50"
          />

          {error && (
            <p className="text-red-400 text-xs mb-4 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleDelete}
              disabled={!matches}
              loading={deleting}
              variant="danger"
              size="lg"
              className="w-full"
            >
              {deleting ? 'Deleting…' : 'Permanently delete account'}
            </Button>
            <button
              onClick={handleClose}
              disabled={deleting}
              className="text-textMuted hover:text-textSecondary text-xs font-medium py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}