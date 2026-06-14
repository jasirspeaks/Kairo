import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, TrendingUp, Brain, Users, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MomentumGraph } from '../components/analysis/MomentumGraph';
import { useAuth } from '../hooks/useAuth';

const DEMO_DATA = [
  { time: 0, score: 38, label: 'Opening', description: 'Cold start — minimal rapport established' },
  { time: 12, score: 55, label: 'Momentum Building', description: 'Prospect engaged with discovery questions' },
  { time: 25, score: 72, label: 'Clarity Peak', description: 'Problem-solution alignment reached' },
  { time: 38, score: 48, label: 'First Objection', description: 'Pricing concern surfaced — rep struggled to pivot' },
  { time: 52, score: 63, label: 'Recovery Phase', description: 'Reframing attempt partially successful' },
  { time: 68, score: 44, label: 'Resistance Detected', description: 'Prospect disengaged — pace mismatch' },
  { time: 82, score: 70, label: 'Buying Signal', description: 'Prospect asked about timeline — intent confirmed' },
  { time: 100, score: 74, label: 'Closing Window', description: 'Strong close attempt with clear next step' },
];

const FEATURES = [
  { icon: TrendingUp, title: 'Deal Momentum Analysis', desc: 'See exactly where your deal gained or lost traction — not just what happened, but why it shifted.' },
  { icon: Brain, title: 'Psychological Insight Engine', desc: 'Kairo reads hesitation, trust shifts, objection patterns, and buying intent beneath what was literally said.' },
  { icon: BarChart3, title: 'Personalized Coaching', desc: 'Specific coaching tied to exact conversation moments. What was said, what went wrong, and what to say instead.' },
  { icon: Users, title: 'Team Intelligence', desc: 'Managers get full visibility across every rep — performance trends, pattern analysis, and coaching priorities.' },
];

export function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-purple-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-white">Kairo</span>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/signin')}>Sign In</Button>
          <Button onClick={() => navigate('/signup')}>Get Started</Button>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center pt-20 pb-16 px-8 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/6 rounded-full blur-3xl pointer-events-none" />
        
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-accent font-medium">AI-Powered Conversation Intelligence</span>
        </div>

        <h1 className="text-5xl font-display font-bold text-white mb-5 leading-tight max-w-3xl mx-auto">
          Understand why your deals{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-primaryLight">
            win or stall
          </span>
        </h1>
        
        <p className="text-textSecondary text-lg max-w-xl mx-auto mb-8 leading-relaxed">
          Kairo analyzes your sales conversations and surfaces the psychological signals, turning points, and communication patterns that determine whether deals close.
        </p>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate('/signup')} size="lg">
            Start Analyzing Free
          </Button>
          <Button onClick={() => navigate('/signin')} variant="secondary" size="lg">
            Sign In
          </Button>
        </div>
      </div>

      {/* Demo Graph */}
      <div className="max-w-4xl mx-auto px-8 pb-20">
        <div className="card p-8 shadow-purple-glow">
          <div className="mb-2 text-center">
            <span className="text-xs text-textMuted uppercase tracking-widest">Live Demo</span>
          </div>
          <MomentumGraph data={DEMO_DATA} animated />
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-8 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-bold text-white mb-3">Every conversation, decoded</h2>
          <p className="text-textSecondary">Not summaries. Not notes. Actual intelligence about what happened and why.</p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-hover p-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="font-display font-semibold text-white mb-2">{title}</h3>
              <p className="text-textSecondary text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center pb-20 px-8">
        <div className="card max-w-lg mx-auto p-8 shadow-purple-glow">
          <h2 className="text-2xl font-display font-bold text-white mb-2">Ready to understand your conversations?</h2>
          <p className="text-textSecondary text-sm mb-6">Paste a transcript. Get a full psychological breakdown in seconds.</p>
          <Button onClick={() => navigate('/signup')} size="lg" className="w-full">
            Get Started — It's Free
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-8 py-6 text-center">
        <p className="text-textMuted text-xs">© 2025 Kairo. Conversation intelligence for serious sales professionals.</p>
      </div>
    </div>
  );
}