import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    // Always show the same success state regardless of whether the email
    // exists -- confirming/denying account existence here is a user
    // enumeration vector. Supabase itself doesn't error on unknown emails
    // for this call, but we treat it as success either way as defense in
    // depth.
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col px-6 pt-safe-t pb-safe-b relative overflow-hidden">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
        <img
          src="/logo-mark.png"
          alt="Kairo"
          className="w-14 h-14 rounded-2xl mb-6 object-contain"
        />
        <h1 className="font-display font-bold text-title1 text-textPrimary mb-2">
          {sent ? 'Check your email' : 'Reset your password'}
        </h1>
        <p className="text-textSecondary text-subhead max-w-[280px]">
          {sent
            ? "If an account exists for that email, we've sent a link to reset your password."
            : "Enter the email on your account and we'll send you a reset link."}
        </p>
      </div>

      <div className="w-full max-w-sm mx-auto pb-8 pt-4 animate-slide-up">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-400 text-footnote">{error}</p>
          </div>
        )}

        {sent ? (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Send another email
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="animate-fade-in">
            <div className="mb-4">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input-field pl-10"
                  autoFocus
                  required
                />
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Send Reset Link
            </Button>
          </form>
        )}

        <Link
          to="/signin"
          className="flex items-center justify-center gap-1.5 text-textMuted hover:text-textSecondary text-footnote mt-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}