import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

export function SignUp() {
  const navigate = useNavigate();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/onboarding');
    }
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` }
    });
  }

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col px-6 pt-safe-t pb-safe-b relative overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Center: logo + tagline, vertically centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-purple-glow mb-6">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-display font-bold text-title1 text-textPrimary mb-2">Kairo</h1>
        <p className="text-textSecondary text-subhead max-w-[280px]">
          See what's actually happening in your deals.
        </p>
      </div>

      {/* Bottom: auth actions, pinned low */}
      <div className="w-full max-w-sm mx-auto pb-8 pt-4 animate-slide-up">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-400 text-footnote">{error}</p>
          </div>
        )}

        {!showEmailForm ? (
          <div className="space-y-3">
            <button
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-surface border border-border hover:border-accent/40 text-textPrimary px-4 py-3.5 rounded-xl transition-all duration-200 text-subhead font-medium disabled:opacity-60"
            >
              {googleLoading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>

            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full flex items-center justify-center gap-3 bg-transparent border border-border hover:border-accent/40 text-textPrimary px-4 py-3.5 rounded-xl transition-all duration-200 text-subhead font-medium"
            >
              <Mail className="w-4 h-4 flex-shrink-0 text-textSecondary" />
              Continue with Email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="animate-fade-in">
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className="flex items-center gap-1.5 text-textMuted hover:text-textSecondary text-footnote mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="space-y-3 mb-4">
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Full name"
                  className="input-field pl-10"
                  autoFocus
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input-field pl-10"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="input-field pl-10"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create Account
            </Button>
          </form>
        )}

        <p className="text-center text-textMuted text-footnote mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-accent hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}