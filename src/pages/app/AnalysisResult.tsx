import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Mic, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Conversation } from '../../types';
import { MomentumGraph } from '../../components/analysis/MomentumGraph';
import { Button } from '../../components/ui/Button';
import { getScoreColor, formatDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

const INSIGHT_CATEGORIES = [
  { key: 'objection_moments', label: 'Objection Moments', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
  { key: 'trust_signals', label: 'Trust Signals', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  { key: 'hesitation_patterns', label: 'Hesitation Patterns', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
  { key: 'buying_intent', label: 'Buying Intent', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  { key: 'persuasion_effectiveness', label: 'Persuasion Effectiveness', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
  { key: 'communication_strengths', label: 'Communication Strengths', color: 'text-teal-400', bg: 'bg-teal-400/10 border-teal-400/20' },
  { key: 'weak_moments', label: 'Weak Moments', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
] as const;

export function AnalysisResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('conversations').select('*').eq('id', id).single()
      .then(({ data }) => { setConv(data); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-t-accent border-border rounded-full animate-spin" />
      </div>
    );
  }

  if (!conv || !conv.analysis_json) {
    return (
      <div className="text-center py-32">
        <p className="text-textSecondary">Analysis not found.</p>
        <Button onClick={() => navigate('/app/dashboard')} variant="secondary" className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { analysis_json: a } = conv;

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button 
            onClick={() => navigate('/app/dashboard')}
            className="flex items-center gap-1.5 text-textMuted hover:text-white text-xs mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-display font-bold text-white mb-1">
            {conv.title || 'Conversation Analysis'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-textMuted text-xs">{formatDate(conv.created_at)}</span>
            <span className={cn(
              'flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border',
              conv.input_type === 'audio' ? 'bg-purple-400/10 border-purple-400/20 text-purple-400' : 'bg-blue-400/10 border-blue-400/20 text-blue-400'
            )}>
              {conv.input_type === 'audio' ? <Mic className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
              {conv.input_type === 'audio' ? 'Audio' : 'Transcript'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-4xl font-display font-bold', getScoreColor(a.overall_score))}>
            {a.overall_score}
          </div>
          <div className="text-xs text-textMuted mt-0.5">Overall Score</div>
        </div>
      </div>

      {/* Section 1: Overview */}
      <div className="card p-6">
        <h2 className="section-label mb-3">Conversation Overview</h2>
        <p className="text-textSecondary text-sm leading-relaxed">{a.overview}</p>
      </div>

      {/* Section 2: Transcript (if audio) */}
      {conv.input_type === 'audio' && conv.transcript && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-surfaceHigh/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-white">Auto-Generated Transcript</span>
            </div>
            {transcriptOpen ? <ChevronUp className="w-4 h-4 text-textMuted" /> : <ChevronDown className="w-4 h-4 text-textMuted" />}
          </button>
          {transcriptOpen && (
            <div className="px-6 pb-6 border-t border-border">
              <pre className="text-xs text-textSecondary leading-relaxed whitespace-pre-wrap font-mono mt-4 max-h-64 overflow-y-auto">
                {conv.transcript}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Section 3: Deal Momentum Graph */}
      <div className="card p-6">
        <MomentumGraph data={a.momentum_data} />
      </div>

      {/* Section 4: Moment Map */}
      <div className="card p-6">
        <h2 className="section-label mb-4">Moment Map</h2>
        <div className="space-y-3">
          {a.moment_map.map((moment, i) => (
            <div key={i} className="flex gap-4 items-start">
              <div className={cn(
                'flex-shrink-0 w-2 h-2 rounded-full mt-2',
                moment.impact === 'positive' ? 'bg-emerald-400' : 
                moment.impact === 'negative' ? 'bg-red-400' : 'bg-amber-400'
              )} />
              <div className="flex-1 bg-surfaceHigh border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white">{moment.phase}</span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    moment.impact === 'positive' ? 'bg-emerald-400/10 text-emerald-400' :
                    moment.impact === 'negative' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'
                  )}>
                    {moment.impact}
                  </span>
                </div>
                <p className="text-textSecondary text-xs mb-1">{moment.what_happened}</p>
                <p className="text-accent text-xs font-medium">Signal: {moment.signal}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5: Insights */}
      <div>
        <h2 className="section-label mb-4">Conversation Insights</h2>
        <div className="grid grid-cols-2 gap-4">
          {INSIGHT_CATEGORIES.map(({ key, label, color, bg }) => {
            const items = (a.insights as any)[key] || [];
            if (!items.length) return null;
            return (
              <div key={key} className="card p-5">
                <div className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border mb-4', bg, color)}>
                  {label}
                </div>
                <div className="space-y-3">
                  {items.map((insight: any, i: number) => (
                    <div key={i} className="border-l-2 border-border pl-3">
                      <p className="text-white text-xs font-medium mb-1">{insight.point}</p>
                      <p className="text-textMuted text-xs leading-relaxed">{insight.explanation}</p>
                      {insight.audio_signal && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-xs bg-purple-400/10 text-purple-400 border border-purple-400/20 px-2 py-0.5 rounded">
                          <Mic className="w-2.5 h-2.5" />
                          Audio Signal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 5: Coaching */}
      <div>
        <h2 className="section-label mb-4">Personalized Coaching</h2>
        <div className="space-y-4">
          {a.coaching.map((item, i) => (
            <div key={i} className="card p-5 border-l-2 border-primary">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">
                  {i + 1}
                </div>
                <div>
                  <p className="text-xs text-accent font-semibold mb-1">{item.moment}</p>
                  <p className="text-textSecondary text-xs italic">"{item.what_was_said}"</p>
                </div>
              </div>

              <div className="ml-9 space-y-3">
                <div className="bg-red-400/5 border border-red-400/15 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-400 mb-1">What went wrong</p>
                  <p className="text-xs text-textSecondary">{item.problem}</p>
                </div>
                <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-lg p-3">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">Better approach</p>
                  <p className="text-xs text-textSecondary">{item.better_approach}</p>
                </div>
                <div className="bg-accent/5 border border-accent/15 rounded-lg p-3">
                  <p className="text-xs font-semibold text-accent mb-1">Why it matters</p>
                  <p className="text-xs text-textSecondary">{item.why_it_matters}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 6: Scores */}
      <div className="card p-6">
        <h2 className="section-label mb-5">Conversation Score</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(a.sub_scores).map(([key, value]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const numVal = value as number;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-textSecondary">{label}</span>
                  <span className={cn('text-xs font-bold', getScoreColor(numVal))}>{numVal}</span>
                </div>
                <div className="h-1.5 bg-surfaceHigh rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'h-full rounded-full transition-all duration-1000',
                      numVal >= 75 ? 'bg-emerald-400' : numVal >= 55 ? 'bg-amber-400' : 'bg-red-400'
                    )}
                    style={{ width: `${numVal}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}