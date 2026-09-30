import React, { useState } from 'react';
import { Sparkles, Mail, Lock, AlertCircle, RefreshCw, X } from 'lucide-react';
import { signInWithPassword, signUp, signInWithOAuth } from '@kairo/api';
import { getAuthRedirectUrl } from '@kairo/platform';

export function AuthView({ onClose }: { onClose?: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await signUp({ email, password });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      if (onClose) onClose();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const redirectUrl = getAuthRedirectUrl('desktop');
      await signInWithOAuth('google', redirectUrl);
    } catch (err: any) {
      setError(err?.message || 'Google sign in failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6 relative flex flex-col gap-5 border border-border shadow-2xl">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-textMuted hover:text-textPrimary p-1 rounded hover:bg-surfaceHigh"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-textPrimary font-display">
            {isSignUp ? 'Create your Kairo account' : 'Sign in to Kairo'}
          </h2>
          <p className="text-xs text-textSecondary">
            Unified deal intelligence across all your devices
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-textMuted block mb-1">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input-field pl-9 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-textMuted block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field pl-9 py-2 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary text-xs py-2.5 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : isSignUp ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-1">
          <div className="h-px bg-border flex-1" />
          <span className="text-[10px] text-textMuted uppercase">or</span>
          <div className="h-px bg-border flex-1" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="btn-secondary text-xs py-2 flex items-center justify-center gap-2"
        >
          <span>Continue with Google</span>
        </button>

        <p className="text-center text-xs text-textMuted">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:underline font-semibold"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}
