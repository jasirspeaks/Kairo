import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, TrendingUp, Brain, Shield, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';

const FEATURES = [
  { icon: Shield, title: 'Deal Intelligence', desc: 'Kairo reviews your deals — not your conversations. The transcript is evidence. The deal is what matters.' },
  { icon: TrendingUp, title: 'Risk Detection', desc: 'Identifies the single risk most likely to prevent your deal from progressing — and what to do about it.' },
  { icon: Brain, title: 'Missing Information', desc: 'Surfaces what you still don\'t know that could kill the deal before it\'s too late to act.' },
  { icon: BarChart3, title: 'Multi-Call Intelligence', desc: 'Tracks how risks evolve across every call. What was unknown in call 1. What got resolved. What emerged.' },
];

const DEMO_DEAL = {
  status: 'At Risk',
  confidence: 'Medium',
  reason: 'Budget authority has not been confirmed. The champion is engaged but has not indicated whether they have sign-off power or need to escalate.',
  highest_priority_risk: 'No confirmation of who approves the purchase',
  missing: [
    { gap: 'Budget authority', question: 'Who needs to approve a purchase at this size?' },
    { gap: 'Decision timeline', question: 'When does a decision need to be made, and why?' },
    { gap: 'Competing options', question: 'Are you evaluating any other solutions right now?' },
  ],
  next_move: 'Send a follow-up email requesting a brief call with the economic buyer before moving to proposal.',
  manager_note: 'Don\'t send pricing until you know who approves it.',
};

export function Landing() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [user, profile, loading, navigate]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-purple-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-textPrimary">Kairo</span>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/signin')}>Sign In</Button>
          <Button onClick={() => navigate('/signup')}>Get Started</Button>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center pt-20 pb-16 px-8 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-full px-4 py-1.5 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">Deal Intelligence Platform</span>
        </div>

        <h1 className="text-5xl font-display font-bold text-textPrimary mb-5 leading-tight max-w-3xl mx-auto">
          Stop losing deals because you{' '}
          <span className="text-primary">
            missed something
          </span>
        </h1>

        <p className="text-textSecondary text-lg max-w-xl mx-auto mb-8 leading-relaxed">
          Kairo reviews your sales conversations and identifies the unanswered questions, hidden risks, and missing information most likely to determine whether the deal closes or dies.
        </p>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/signup')} size="lg">
            Review My First Deal
          </Button>
          <Button onClick={() => navigate('/signin')} variant="secondary" size="lg">
            Sign In
          </Button>
        </div>
      </div>

      {/* Demo Deal Review */}
      <div className="max-w-2xl mx-auto px-8 pb-20">
        <div className="text-center mb-6">
          <span className="text-xs text-textMuted uppercase tracking-widest">Live Demo — Deal Review</span>
        </div>
        <div className="card p-6 space-y-5 shadow-card-hover">
          {/* Verdict */}
          <div className="border-l-4 border-red-400 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-50 border-red-200 text-red-600">
                {DEMO_DEAL.status}
              </span>
              <span className="text-xs text-textMuted border border-border px-2 py-1 rounded-full bg-surfaceHigh">
                {DEMO_DEAL.confidence} Confidence
              </span>
            </div>
            <p className="text-textSecondary text-sm leading-relaxed">{DEMO_DEAL.reason}</p>
          </div>

          {/* What You're Missing */}
          <div>
            <p className="section-label mb-3">What You're Missing</p>
            <div className="space-y-2">
              {DEMO_DEAL.missing.map((item, i) => (
                <div key={i} className="bg-surfaceHigh border border-border rounded-lg p-3 flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600 text-xs font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-textPrimary text-xs font-medium mb-1">{item.gap}</p>
                    <p className="text-primary text-xs">Ask: "{item.question}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next Move + Manager Note */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surfaceHigh border border-border rounded-lg p-3">
              <p className="section-label mb-1.5">Next Move</p>
              <p className="text-textPrimary text-xs leading-relaxed">{DEMO_DEAL.next_move}</p>
            </div>
            <div className="bg-primary/5 border border-primary/15 rounded-lg p-3">
              <p className="section-label mb-1.5">Manager Note</p>
              <p className="text-textPrimary text-xs font-medium">{DEMO_DEAL.manager_note}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-8 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-bold text-textPrimary mb-3">
            The deal is what matters
          </h2>
          <p className="text-textSecondary">
            Not the conversation. Not the transcript. The deal.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-hover p-6">
              <div className="w-10 h-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-textPrimary mb-2">{title}</h3>
              <p className="text-textSecondary text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center pb-20 px-8">
        <div className="card max-w-lg mx-auto p-8 shadow-card-hover">
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            What are you missing that could cost you this deal?
          </h2>
          <p className="text-textSecondary text-sm mb-6">
            Paste a transcript. Get a deal review in under 30 seconds.
          </p>
          <Button onClick={() => navigate('/signup')} size="lg" className="w-full">
            Review My First Deal
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-8 py-6 text-center bg-surface">
        <p className="text-textMuted text-xs">© 2025 Kairo. Deal intelligence for serious sales professionals.</p>
      </div>
    </div>
  );
}