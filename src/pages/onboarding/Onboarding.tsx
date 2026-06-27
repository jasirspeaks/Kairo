import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
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
  const { user, refetchProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFinish() {
    if (!user || !whoYouAre) return;
    setLoading(true);

    await supabase.from('profiles').update({
      what_you_sell: whatYouSell.trim(),
      who_you_are: whoYouAre,
      onboarding_complete: true,
    }).eq('id', user.id);

    await refetchProfile();
    navigate('/app/dashboard', { replace: true });
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/6 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg animate-slide-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-purple-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-white">Kairo</span>
        </div>

        {/* Step 1 — What are you selling */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-xs text-accent font-medium mb-3 uppercase tracking-widest">Step 1 of 2</p>
              <h1 className="text-2xl font-display font-bold text-white mb-2">
                What are you selling?
              </h1>
              <p className="text-textSecondary text-sm">
                Kairo uses this to frame deal reviews in the right context.
              </p>
            </div>

            <div className="card p-6 mb-4">
              <textarea
                value={whatYouSell}
                onChange={e => setWhatYouSell(e.target.value)}
                placeholder="e.g. SaaS product for HR teams, marketing agency services, B2B consulting for fintech companies..."
                className="input-field min-h-28 resize-none"
                autoFocus
              />
              <p className="text-textMuted text-xs mt-2">
                Be specific — the more context, the sharper the analysis.
              </p>
            </div>

            <Button
              onClick={() => setStep(2)}
              size="lg"
              className="w-full"
              disabled={!whatYouSell.trim()}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>

            <button
              onClick={() => setStep(2)}
              className="w-full text-center text-xs text-textMuted hover:text-textSecondary mt-3 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Step 2 — Who are you */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-xs text-accent font-medium mb-3 uppercase tracking-widest">Step 2 of 2</p>
              <h1 className="text-2xl font-display font-bold text-white mb-2">
                Who are you?
              </h1>
              <p className="text-textSecondary text-sm">
                This shapes how Kairo talks to you about your deals.
              </p>
            </div>

            <div className="space-y-2 mb-6">
              {WHO_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setWhoYouAre(option.value)}
                  className={cn(
                    'w-full text-left card p-4 border-2 transition-all duration-200',
                    whoYouAre === option.value
                      ? 'border-primary bg-primary/10 shadow-purple-glow-sm'
                      : 'border-border hover:border-accent/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        'text-sm font-semibold mb-0.5',
                        whoYouAre === option.value ? 'text-white' : 'text-textSecondary'
                      )}>
                        {option.label}
                      </p>
                      <p className="text-textMuted text-xs">{option.desc}</p>
                    </div>
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex-shrink-0 ml-4 transition-all',
                      whoYouAre === option.value
                        ? 'border-accent bg-accent'
                        : 'border-border'
                    )} />
                  </div>
                </button>
              ))}
            </div>

            <Button
              onClick={handleFinish}
              size="lg"
              className="w-full"
              loading={loading}
              disabled={!whoYouAre}
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