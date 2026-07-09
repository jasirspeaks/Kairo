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

export function NewDeal() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>('deal');
  const [dealName, setDealName] = useState('');
  const [companyName, setCompanyName] = useState('');
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

    if (!text) { setError('Please paste a transcript before reviewing.'); return; }
    if (text.length < 100) { setError('Transcript is too short.'); return; }
    if (text.length > 50000) { setError('Transcript is too long.'); return; }

    setAnalyzing(true);
    setError('');

    let dealId: string | null = null;

    try {
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
      dealId = deal.id;

      const review = await reviewDeal(text, {
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        previous_review: null,
        seller_context: {
          what_you_sell: profile?.what_you_sell || undefined,
          who_you_are: profile?.who_you_are || undefined,
        },
      });

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: deal.id,
          title: conversationTitle.trim() || `Call 1 — ${new Date().toLocaleDateString()}`,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to save conversation.');

      await supabase.from('deal_state').insert({
        deal_id: deal.id,
        user_id: user.id,
        current_status: review.deal_status.status,
        confidence: review.deal_status.confidence,
        highest_priority_risk: review.highest_priority_risk.risk,
        highest_priority_risk_full: review.highest_priority_risk,
        what_youre_missing: review.what_youre_missing,
        key_follow_up_message: review.key_follow_up_message,
        manager_note: review.manager_note,
        supporting_evidence: review.supporting_evidence,
        last_review_summary: review.deal_status.reason,
      });

      await supabase.from('deals').update({
        risk_level: getRiskLevel(review.deal_status.status),
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id);

      navigate(`/app/deals/${deal.id}/calls/${conv.id}`);

    } catch (err: any) {
      if (dealId) {
        await supabase.from('deals').delete().eq('id', dealId);
      }
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
      <div className="mb-8">
        {step === 'transcript' && (
          <button
            onClick={() => setStep('deal')}
            className="flex items-center gap-1.5 text-textMuted hover:text-textPrimary text-xs mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
              step === 'deal' ? 'bg-primary border-primary text-white' : 'bg-primary/10 border-primary/30 text-primary'
            )}>
              {step === 'deal' ? '1' : '✓'}
            </div>
            <span className={cn('text-xs font-medium', step === 'deal' ? 'text-textPrimary' : 'text-primary')}>
              Deal Info
            </span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
              step === 'transcript' ? 'bg-primary border-primary text-white' : 'bg-surfaceHigh border-border text-textMuted'
            )}>
              2
            </div>
            <span className={cn('text-xs font-medium', step === 'transcript' ? 'text-textPrimary' : 'text-textMuted')}>
              Transcript
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
          {step === 'deal' ? 'New Deal' : 'Add Transcript'}
        </h1>
        <p className="text-textSecondary text-sm">
          {step === 'deal'
            ? 'Start by naming the deal. The transcript comes next.'
            : 'Paste the call transcript. Kairo will review the deal and identify what matters most.'
          }
        </p>
      </div>

      {step === 'deal' && (
        <form onSubmit={handleDealContinue} className="space-y-4">
          <div className="card p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Deal Name <span className="text-red-500">*</span>
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
                Company Name <span className="text-red-500">*</span>
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

      {step === 'transcript' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-textPrimary text-sm font-medium truncate">{dealName}</p>
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
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Transcript</label>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder={`Paste your call transcript here.\n\nRep: Thanks for taking the time today...\nProspect: Of course...\n\nInclude speaker labels for better analysis.`}
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
            <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={!transcript.trim()}>
            <FileText className="w-4 h-4" />
            Review Deal
          </Button>
        </form>
      )}
    </div>
  );
}