import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ShieldAlert, GitBranch, Brain, ArrowRight, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';

const FEATURES = [
  { icon: GitBranch, title: 'Multi-Call Intelligence', desc: 'Kairo tracks how risks evolve across every call on a deal — what got resolved, what persists, what\'s new. This is the view a single transcript summary can\'t give you.' },
  { icon: ShieldAlert, title: 'Risk Center', desc: 'Every active deal, ranked by severity, in one place. Know which three deals need you this week before you open your inbox.' },
  { icon: Brain, title: 'Missing Information', desc: 'Surfaces what you still don\'t know that could kill the deal — before it\'s too late to act on it.' },
  { icon: Zap, title: 'Deal Reviews', desc: 'A focused review after every call: status, biggest risk, what to ask next, and a ready-to-send follow-up.' },
];

// Risk Center demo — pipeline-wide view, ranked by severity
const RISK_CENTER_DEMO = [
  {
    name: 'Acme Corp — Enterprise Plan',
    company: 'Acme Corp',
    status: 'At Risk',
    risk: 'No confirmation of who approves the purchase',
  },
  {
    name: 'Northwind — Team Rollout',
    company: 'Northwind Logistics',
    status: 'Open',
    risk: 'Decision timeline still unconfirmed after 2 calls',
  },
  {
    name: 'Fenwick Labs — Pilot',
    company: 'Fenwick Labs',
    status: 'Healthy',
    risk: 'Champion confirmed budget, next step scheduled',
  },
];

// Multi-call evolution demo — the "what changed since last call" moment
const EVOLUTION_DEMO = {
  dealName: 'Acme Corp — Enterprise Plan',
  callLabel: 'Call 3 — Negotiation',
  resolved: [
    'Champion confirmed team size and rollout timeline',
  ],
  persists: [
    'Economic buyer still not identified',
  ],
  new_risks: [
    'Buyer mentioned evaluating a second vendor for the first time',
  ],
};

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'At Risk': return 'bg-red-50 border-red-200 text-red-600';
    case 'Open': return 'bg-amber-50 border-amber-200 text-amber-700';
    case 'Healthy': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    default: return 'bg-surfaceHigh border-border text-textMuted';
  }
}

function riskDotClasses(status: string) {
  switch (status) {
    case 'At Risk': return 'bg-red-400';
    case 'Open': return 'bg-amber-400';
    case 'Healthy': return 'bg-emerald-400';
    default: return 'bg-border';
  }
}

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
          <span className="text-xs text-primary font-medium">Deal Operating System</span>
        </div>

        <h1 className="text-5xl font-display font-bold text-textPrimary mb-5 leading-tight max-w-3xl mx-auto">
          Never lose a{' '}
          <span className="text-primary">
            winnable deal
          </span>
          {' '}to something you didn't see
        </h1>

        <p className="text-textSecondary text-lg max-w-xl mx-auto mb-8 leading-relaxed">
          Kairo is the central workspace where every deal lives with memory, risk tracking, and clear next actions — so you run your pipeline with confidence instead of hope.
        </p>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/signup')} size="lg">
            Start Free — Review Your First Deal
          </Button>
          <Button onClick={() => navigate('/signin')} variant="secondary" size="lg">
            Sign In
          </Button>
        </div>
      </div>

      {/* Demo: Risk Center + Multi-Call Evolution */}
      <div className="max-w-5xl mx-auto px-8 pb-20">
        <div className="text-center mb-8">
          <span className="text-xs text-textMuted uppercase tracking-widest">Live Demo</span>
          <h2 className="text-2xl font-display font-bold text-textPrimary mt-2">
            Your whole pipeline. One glance.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Risk Center panel */}
          <div className="lg:col-span-2 card p-6 shadow-card-hover flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <p className="section-label">Risk Center</p>
            </div>
            <div className="space-y-2 flex-1">
              {RISK_CENTER_DEMO.map((deal) => (
                <div
                  key={deal.name}
                  className="border border-border rounded-lg px-4 py-3 bg-surfaceHigh/60"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', riskDotClasses(deal.status))} />
                    <p className="text-textPrimary text-xs font-medium truncate flex-1">{deal.name}</p>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', statusBadgeClasses(deal.status))}>
                      {deal.status}
                    </span>
                  </div>
                  <p className="text-textMuted text-xs leading-snug">{deal.risk}</p>
                </div>
              ))}
            </div>
            <p className="text-textMuted text-xs mt-4 leading-relaxed">
              Every active deal, ranked by severity — so you know exactly where to spend the next 20 minutes.
            </p>
          </div>

          {/* Multi-call evolution panel */}
          <div className="lg:col-span-3 card p-6 shadow-card-hover">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />
                <p className="section-label">What Changed Since Last Call</p>
              </div>
            </div>
            <p className="text-textPrimary text-sm font-medium mb-4">
              {EVOLUTION_DEMO.dealName} <span className="text-textMuted font-normal">· {EVOLUTION_DEMO.callLabel}</span>
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Resolved</p>
                </div>
                {EVOLUTION_DEMO.resolved.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 mt-1.5" />
                    <p className="text-textSecondary text-xs leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Still Open</p>
                </div>
                {EVOLUTION_DEMO.persists.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    <p className="text-textSecondary text-xs leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">New Risk</p>
                </div>
                {EVOLUTION_DEMO.new_risks.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                    <p className="text-textSecondary text-xs leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border bg-primary/5 -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
              <p className="text-xs text-primary font-semibold mb-1">Manager Note</p>
              <p className="text-textPrimary text-sm font-medium">
                A second vendor just entered the picture. Get to the economic buyer before pricing goes out.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-textMuted text-xs mt-5 max-w-lg mx-auto leading-relaxed">
          This evolving view — not a one-off transcript summary — is what a free tool can't give you. Kairo remembers every call on the deal.
        </p>
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
            Start Free — Review Your First Deal
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-8 py-6 text-center bg-surface">
        <p className="text-textMuted text-xs">© 2025 Kairo. Deal intelligence for founders and full-cycle sellers.</p>
      </div>
    </div>
  );
}