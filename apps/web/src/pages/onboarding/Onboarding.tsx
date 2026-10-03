import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';

const WHO_OPTIONS = [
  { value: 'founder', label: 'Founder', desc: 'Running sales yourself at an early stage company' },
  { value: 'ae', label: 'Account Executive', desc: 'Full-cycle AE managing your own pipeline' },
  { value: 'consultant', label: 'Consultant or Agency', desc: 'Selling consulting, services, or agency work' },
  { value: 'freelancer', label: 'Freelancer', desc: 'Independent professional winning client work' },
  { value: 'other', label: 'Other', desc: 'Something else entirely' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refetchProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [whatYouSell, setWhatYouSell] = useState(profile?.what_you_sell ?? '');
  const [whoYouAre, setWhoYouAre] = useState(profile?.who_you_are ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      if (profile.who_you_are && !whoYouAre) {
        setWhoYouAre(profile.who_you_are);
      }
      if (profile.what_you_sell && !whatYouSell) {
        setWhatYouSell(profile.what_you_sell);
      }
    }
  }, [profile]);

  async function handleStep1Continue() {
    if (!whoYouAre) return;
    setError('');
    if (user) {
      try {
        await supabase.from('profiles').update({
          who_you_are: whoYouAre,
        }).eq('id', user.id);
      } catch {
        // Non-blocking partial save
      }
    }
    setStep(2);
  }

  async function handleFinish() {
    setError('');
    if (!user) {
      setError('You must be signed in to complete onboarding.');
      return;
    }
    if (!whoYouAre || !whoYouAre.trim()) {
      setError('Please select who you are in Step 1.');
      setStep(1);
      return;
    }
    if (!whatYouSell || !whatYouSell.trim()) {
      setError('Please describe what you are selling.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.from('profiles').update({
        what_you_sell: whatYouSell.trim(),
        who_you_are: whoYouAre.trim(),
        onboarding_complete: true,
      }).eq('id', user.id);

      if (updateError) {
        setError('Failed to save onboarding information. Please try again.');
        setLoading(false);
        return;
      }

      await refetchProfile();
      navigate('/app/dashboard', { replace: true });
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/6 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg animate-slide-up relative">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <img
            src="/logo-mark.png"
            alt="Kairo"
            className="w-8 h-8 rounded-lg object-contain"
          />
          <span className="font-display font-bold text-xl text-textPrimary">Kairo</span>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-400 text-footnote">{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-xs text-primary font-medium mb-3 uppercase tracking-widest">Step 1 of 2</p>
              <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Who are you?</h1>
              <p className="text-textSecondary text-sm">This shapes how Kairo talks to you about your deals.</p>
            </div>
            <div className="space-y-2 mb-6">
              {WHO_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setError('');
                    setWhoYouAre(option.value);
                  }}
                  className={cn(
                    'w-full text-left card p-4 border-2 transition-all duration-200',
                    whoYouAre === option.value
                      ? 'border-primary bg-primary/8'
                      : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        'text-sm font-semibold mb-0.5',
                        whoYouAre === option.value ? 'text-textPrimary' : 'text-textSecondary'
                      )}>
                        {option.label}
                      </p>
                      <p className="text-textMuted text-xs">{option.desc}</p>
                    </div>
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex-shrink-0 ml-4 transition-all',
                      whoYouAre === option.value ? 'border-primary bg-primary' : 'border-border'
                    )} />
                  </div>
                </button>
              ))}
            </div>
            <Button onClick={handleStep1Continue} size="lg" className="w-full" disabled={!whoYouAre}>
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep(1);
              }}
              className="flex items-center gap-1.5 text-textMuted hover:text-textSecondary text-footnote mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="text-center mb-8">
              <p className="text-xs text-primary font-medium mb-3 uppercase tracking-widest">Step 2 of 2</p>
              <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">What are you selling?</h1>
              <p className="text-textSecondary text-sm">Kairo uses this to frame deal reviews in the right context.</p>
            </div>
            <div className="card p-6 mb-4">
              <textarea
                value={whatYouSell}
                onChange={e => {
                  setError('');
                  setWhatYouSell(e.target.value);
                }}
                placeholder="e.g. SaaS product for HR teams, marketing agency services, B2B consulting for fintech companies..."
                className="input-field min-h-28 resize-none"
                autoFocus
              />
              <p className="text-textMuted text-xs mt-2">Be specific — the more context, the sharper the analysis.</p>
            </div>
            <Button
              onClick={handleFinish}
              size="lg"
              className="w-full"
              loading={loading}
              disabled={!whatYouSell.trim()}
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}