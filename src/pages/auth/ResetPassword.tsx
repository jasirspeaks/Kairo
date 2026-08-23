import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

const MIN_PASSWORD_LENGTH = 8;

// Clicking the emailed reset link redirects here with the recovery token
// in the URL. Supabase's client picks that up automatically (via
// onAuthStateChange firing a PASSWORD_RECOVERY event, or detectSessionInUrl
// on load) and exchanges it for a real session -- at that point
// updateUser({ password }) is enough to set the new password, no need to
// parse the token ourselves. Until that session lands, we don't know yet
// whether the link was valid, so we show a brief checking state rather
// than either the form or an error immediately.
type LinkStatus = 'checking' | 'valid' | 'invalid';

export function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LinkStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let resolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        resolved = true;
        setStatus('valid');
      }
    });

    // Fallback: if the recovery event already fired before this component
    // mounted (or the browser restored an existing recovery session), a
    // present session after a short grace period is treated as valid too.
    const timeout = setTimeout(async () => {
      if (resolved) return;
      const { data: { session } } = await supabase.auth.getSession();
      setStatus(session ? 'valid' : 'invalid');
    }, 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/app/dashboard'), 2000);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col px-6 pt-safe-t pb-safe-b relative overflow-hidden">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-purple-glow mb-6">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-display font-bold text-title1 text-textPrimary mb-2">
          {success ? 'Password updated' : 'Set a new password'}
        </h1>
        <p className="text-textSecondary text-subhead max-w-[280px]">
          {status === 'invalid' && !success
            ? 'This reset link is invalid or has expired.'
            : success
              ? 'Taking you to your dashboard...'
              : 'Choose a new password for your account.'}
        </p>
      </div>

      <div className="w-full max-w-sm mx-auto pb-8 pt-4 animate-slide-up">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-400 text-footnote">{error}</p>
          </div>
        )}

        {status === 'checking' && !success && (
          <div className="flex justify-center py-4">
            <span className="w-6 h-6 border-2 border-t-primary border-border rounded-full animate-spin" />
          </div>
        )}

        {status === 'valid' && !success && (
          <form onSubmit={handleSubmit} className="animate-fade-in">
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="New password"
                  className="input-field pl-10"
                  autoFocus
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Update Password
            </Button>
          </form>
        )}

        {status === 'invalid' && !success && (
          <Link to="/forgot-password">
            <Button className="w-full" size="lg">
              Request a new link
            </Button>
          </Link>
        )}

        {!success && (
          <Link
            to="/signin"
            className="flex items-center justify-center gap-1.5 text-textMuted hover:text-textSecondary text-footnote mt-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}