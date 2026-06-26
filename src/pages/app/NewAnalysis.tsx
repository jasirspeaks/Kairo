import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Building2, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewDeal, getRiskLevel } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { cn } from '../../lib/utils';

type Step = 'deal' | 'transcript';

export function NewAnalysis() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('deal');

  // Deal fields
  const [dealName, setDealName] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Transcript fields
  const [transcript, setTranscript] = useState('');
  const [conversationTitle, setConversationTitle] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  function handleDealContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!dealName.trim() || !companyName.trim()) return;
    setStep('transcript');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const text = transcript.trim();

    if (!text) {
      setError('Please paste a transcript before reviewing.');
      return;
    }

    if (text.length < 100) {
      setError('Transcript is too short. Please provide a more complete conversation.');
      return;
    }

    if (text.length > 50000) {
      setError('Transcript is too long. Please trim it to under 50,000 characters.');
      return;
    }

    setAnalyzing(true);
    setError('');

    try {
      // Step 1 — Create the deal
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          user_id: user.id,
          deal_name: dealName.trim(),
          company_name: companyName.trim(),
          status: 'active',
          risk_level: 'none',
        })
        .select()
        .single();

      if (dealError || !deal) throw new Error('Failed to create deal.');

      // Step 2 — Create conversation record
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: deal.id,
          title: conversationTitle.trim() || `Call 1 — ${new Date().toLocaleDateString()}`,
          input_type: 'transcript',
          transcript: text,
          status: 'analyzing',
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to create conversation record.');

      // Step 3 — Run deal review
      const review = await reviewDeal(text, {
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        previous_review: null,
      });

      // Step 4 — Update conversation with review
      await supabase.from('conversations').update({
        analysis_json: review,
        status: 'complete',
      }).eq('id', conv.id);

      // Step 5 — Create or update deal state
      await supabase.from('deal_state').insert({
        deal_id: deal.id,
        user_id: user.id,
        current_status: review.deal_status.status,
        confidence: review.deal_status.confidence,
        highest_priority_risk: review.highest_priority_risk.risk,
        what_youre_missing: review.what_youre_missing,
        next_move: review.next_move,
        next_question: review.next_question,
        manager_note: review.manager_note,
        supporting_evidence: review.supporting_evidence,
        last_review_summary: review.deal_status.reason,
      });

      // Step 6 — Update deal risk level
      await supabase.from('deals').update({
        risk_level: getRiskLevel(review.deal_status.status),
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id);

      // Navigate to deal review
      navigate(`/app/deals/${deal.id}`);

    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setAnalyzing(false);
    }
  }

  if (analyzing) {
    return (
      <div className="min-h-[calc(100vh-64px)]">
        <LoadingState phase="analyzing" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-xl">
      {/* Header */}
      <div className="mb-8">
        {step === 'transcript' && (
          <button
            onClick={() => setStep('deal')}
            className="flex items-center gap-1.5 text-textMuted hover:text-white text-xs mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
              step === 'deal'
                ? 'bg-primary border-primary text-white'
                : 'bg-primary/20 border-primary/40 text-accent'
            )}>
              {step === 'deal' ? '1' : '✓'}
            </div>
            <span className={cn('text-xs font-medium', step === 'deal' ? 'text-white' : 'text-accent')}>
              Deal Info
            </span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
              step === 'transcript'
                ? 'bg-primary border-primary text-white'
                : 'bg-surfaceHigh border-border text-textMuted'
            )}>
              2
            </div>
            <span className={cn('text-xs font-medium', step === 'transcript' ? 'text-white' : 'text-textMuted')}>
              Transcript
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-display font-bold text-white mb-1">
          {step === 'deal' ? 'New Deal' : 'Add Transcript'}
        </h1>
        <p className="text-textSecondary text-sm">
          {step === 'deal'
            ? 'Start by naming the deal. The transcript comes next.'
            : 'Paste the call transcript. Kairo will review the deal and identify what matters most.'
          }
        </p>
      </div>

      {/* Step 1 — Deal Info */}
      {step === 'deal' && (
        <form onSubmit={handleDealContinue} className="space-y-4">
          <div className="card p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Deal Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  value={dealName}
                  onChange={e => setDealName(e.target.value)}
                  placeholder="e.g. Acme Corp — Enterprise Plan"
                  className="input-field pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Company Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!dealName.trim() || !companyName.trim()}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      )}

      {/* Step 2 — Transcript */}
      {step === 'transcript' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{dealName}</p>
                <p className="text-textMuted text-xs">{companyName}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Call Title <span className="text-textMuted">(optional)</span>
              </label>
              <input
                type="text"
                value={conversationTitle}
                onChange={e => setConversationTitle(e.target.value)}
                placeholder="e.g. Discovery Call"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Transcript
              </label>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder={`Paste your call transcript here.\n\nRep: Thanks for taking the time today...\nProspect: Of course, we've been looking at a few options...\n\nInclude speaker labels for better analysis.`}
                className="input-field min-h-64 resize-y font-mono text-xs leading-relaxed"
                autoFocus
              />
              <p className="text-xs text-textMuted mt-1.5">
                {transcript.length > 0
                  ? `${transcript.trim().split(/\s+/).filter(Boolean).length} words`
                  : 'Include speaker labels (Rep: / Prospect:) for best results'
                }
              </p>
            </div>
          </div>

          {error && (
            <div className="flex gap-2 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!transcript.trim()}
          >
            <FileText className="w-4 h-4" />
            Review Deal
          </Button>
        </form>
      )}
    </div>
  );
}