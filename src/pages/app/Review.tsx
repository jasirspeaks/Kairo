import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, AlertTriangle, CheckCircle, Clock,
  TrendingDown, Copy, Check, Activity, Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewCall, saveDealState, saveStakeholders, getRiskLevel, getStatusStyle } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, Conversation, DEAL_STAGES, DealStage } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { ScheduleMeetingButton } from '../../components/ui/ScheduleMeetingButton';
import { formatDate, cn } from '../../lib/utils';

// Call Status icons -- distinct from Deal Status, this describes only how
// THIS call went, not the deal's overall condition.
function getCallStatusIcon(status: string) {
  switch (status) {
    case 'On Track': return <CheckCircle className="w-5 h-5" style={{ color: '#3DD68C' }} />;
    case 'Needs Attention': return <Clock className="w-5 h-5" style={{ color: '#F6B23E' }} />;
    case 'At Risk': return <AlertTriangle className="w-5 h-5" style={{ color: '#FF667A' }} />;
    case 'Stalled': return <TrendingDown className="w-5 h-5" style={{ color: '#C97A2B' }} />;
    default: return <Activity className="w-5 h-5 text-textMuted" />;
  }
}

function getCallStatusBorder(status: string): string {
  switch (status) {
    case 'On Track': return 'border-emerald-400/60';
    case 'Needs Attention': return 'border-amber-400/60';
    case 'At Risk': return 'border-red-400/60';
    case 'Stalled': return 'border-orange-400/60';
    default: return 'border-border';
  }
}

export function Review() {
  const { dealId, callId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [allCalls, setAllCalls] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [addingCall, setAddingCall] = useState(false);
  const [newTranscript, setNewTranscript] = useState('');
  const [newDealStage, setNewDealStage] = useState<DealStage>('Qualification');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dealId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, callId]);

  async function fetchData() {
    setLoading(true);

    const { data: dealData } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    const { data: callsData } = await supabase
      .from('conversations')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true });

    const calls = callsData || [];
    setDeal(dealData);
    setAllCalls(calls);
    if (dealData?.deal_stage) setNewDealStage(dealData.deal_stage);

    const targetCall = callId
      ? calls.find(c => c.id === callId)
      : calls[calls.length - 1];

    setConv(targetCall || null);
    setLoading(false);
  }

  const isLatestCall = conv && allCalls.length > 0 &&
    conv.id === allCalls[allCalls.length - 1].id;

  function handleBack() {
    if (dealId) {
      navigate(`/app/deals/${dealId}`);
    } else {
      navigate('/app/dashboard');
    }
  }

  async function handleAddCall(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !deal || !newTranscript.trim()) return;

    const text = newTranscript.trim();
    if (text.length < 100) { setError('Transcript is too short.'); return; }

    setAnalyzing(true);
    setError('');

    let convId: string | null = null;

    try {
      const previousReview = conv?.analysis_json || null;

      const review = await reviewCall(text, {
        deal_name: deal.deal_name,
        company_name: deal.company_name,
        deal_stage: newDealStage,
        previous_review: previousReview,
        seller_context: {
          what_you_sell: profile?.what_you_sell || undefined,
          who_you_are: profile?.who_you_are || undefined,
        },
      });

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: deal.id,
          deal_stage: newDealStage,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !newConv) throw new Error('Failed to save conversation.');
      convId = newConv.id;

      // review.deal is already the deal's complete current-state assessment
      // -- computed with the full prior history as context. Write directly,
      // no aggregation step.
      await saveDealState(deal.id, user.id, review);
      await saveStakeholders(deal.id, user.id, review);

      await supabase.from('deals').update({
        deal_stage: newDealStage,
        risk_level: getRiskLevel(review.deal.status),
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id);

      setNewTranscript('');
      setAddingCall(false);
      navigate(`/app/deals/${deal.id}/calls/${newConv.id}`);

    } catch (err: any) {
      if (convId) {
        await supabase.from('conversations').delete().eq('id', convId);
      }
      setError(err.message || 'Something went wrong.');
    } finally {
      setAnalyzing(false);
    }
  }

  function copyMessage() {
    if (!conv?.analysis_json?.call?.key_follow_up_message) return;
    navigator.clipboard.writeText(conv.analysis_json.call.key_follow_up_message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );

  if (analyzing) return (
    <div className="min-h-[calc(100vh-64px)]">
      <LoadingState phase="analyzing" />
    </div>
  );

  if (!deal || !conv || !conv.analysis_json) return (
    <EmptyState
      icon={<AlertTriangle className="w-6 h-6" />}
      title="Review not found"
      description="This review doesn't exist or hasn't been processed yet."
      action={<Button onClick={() => navigate('/app/dashboard')}>Back to Dashboard</Button>}
    />
  );

  // Call Review displays the CALL-scoped half of the extraction. Deal facts
  // (name, company, stage) come from the deals table, not re-extracted.
  const c = conv.analysis_json.call;
  const borderColor = getCallStatusBorder(c.call_status);

  return (
    <div className="animate-fade-in max-w-2xl">

      {/* Mobile: sticky top bar with deal name + Add Call action */}
      <div className="-mx-4 md:hidden">
        <TopBar
          title={deal.deal_name}
          onBack={handleBack}
          action={
            <div className="flex items-center gap-1.5">
              <ScheduleMeetingButton userId={user?.id} variant="icon" />
              {isLatestCall && (
                <button
                  onClick={() => setAddingCall(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary"
                  aria-label="Add Call"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* Sticky verdict header - stays visible while scrolling on mobile */}
      <div className="sticky top-0 md:static z-20 -mx-4 px-4 md:mx-0 md:px-0 bg-bg pt-2 md:pt-0 pb-2 md:pb-0">
        <div className="hidden md:block mb-4">
          <p className="text-textSecondary text-sm">
            {deal.company_name} · {deal.deal_stage} · {conv.title || formatDate(conv.created_at)}
          </p>
          <div className="flex justify-end gap-2 -mt-6">
            <ScheduleMeetingButton userId={user?.id} size="sm" />
            {isLatestCall && (
              <Button onClick={() => setAddingCall(true)} size="sm" variant="secondary">
                <Plus className="w-3.5 h-3.5" /> Add Call
              </Button>
            )}
          </div>
        </div>

        <div className={cn('card p-4 md:p-6 border-l-4', borderColor)}>
          <div className="flex items-center gap-3 mb-2 md:mb-3">
            {getCallStatusIcon(c.call_status)}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold px-2.5 py-1 rounded-full border" style={getStatusStyle(c.call_status)}>
                {c.call_status}
              </span>
            </div>
          </div>
          <p className="text-textPrimary text-sm font-semibold mb-1">{c.verdict}</p>
          {c.reason && (
            <p className="text-textSecondary text-sm leading-relaxed">{c.reason}</p>
          )}
        </div>
      </div>

      <div className="space-y-3 md:space-y-5 mt-3 md:mt-5">

        {/* Highest Priority Risk (this call) - always open, headline */}
        {c.highest_priority_risk?.risk && (
          <div className="card p-4 md:p-6 border border-red-400/20">
            <h2 className="section-label mb-3">Highest Priority Risk</h2>
            <p className="text-textPrimary text-sm font-semibold mb-3">
              {c.highest_priority_risk.risk}
            </p>
            {c.highest_priority_risk.why_it_matters && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
                <p className="text-textSecondary text-xs leading-relaxed">
                  {c.highest_priority_risk.why_it_matters}
                </p>
              </div>
            )}
            {c.highest_priority_risk.evidence && (
              <div className="bg-surfaceHigh border border-border rounded-lg p-3">
                <p className="text-xs text-textMuted font-medium mb-1">Evidence</p>
                <p className="text-textSecondary text-xs leading-relaxed italic">
                  "{c.highest_priority_risk.evidence}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Missing Information (this call) - collapsed by default */}
        {c.what_youre_missing && c.what_youre_missing.length > 0 && (
          <CollapsibleSection title="Missing Information" count={c.what_youre_missing.length}>
            <div className="space-y-3 pt-4">
              {c.what_youre_missing.map((item, i) => (
                <div key={i} className="bg-surfaceHigh border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-textPrimary text-xs font-medium mb-1.5">{item.gap}</p>
                      <p className="text-primary text-xs">Ask: "{item.question_to_answer}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recommended Next Action (this call) - always visible */}
        {c.recommended_next_action && (
          <div className="card p-4 md:p-6">
            <h2 className="section-label mb-2">Recommended Next Action</h2>
            <p className="text-textPrimary text-sm leading-relaxed">{c.recommended_next_action}</p>
          </div>
        )}

        {/* Key Follow-up Message - always visible, high-frequency action */}
        {c.key_follow_up_message && (
          <div className="card p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-label">Key Follow-up Message</h2>
              <button
                onClick={copyMessage}
                className="flex items-center gap-1.5 text-xs text-primary font-medium min-h-[32px] px-1"
              >
                {copied
                  ? <><Check className="w-3.5 h-3.5" /> Copied</>
                  : <><Copy className="w-3.5 h-3.5" /> Copy</>
                }
              </button>
            </div>
            <div className="bg-surfaceHigh border border-border rounded-lg p-4">
              <p className="text-textSecondary text-sm leading-relaxed whitespace-pre-line">
                {c.key_follow_up_message}
              </p>
            </div>
          </div>
        )}

        {/* Manager Note (this call) - always visible, short */}
        {c.manager_note && (
          <div className="bg-primary/8 border border-primary/15 rounded-xl px-5 py-4">
            <p className="text-xs text-primary font-semibold mb-1">Manager Note</p>
            <p className="text-textPrimary text-sm font-medium">{c.manager_note}</p>
          </div>
        )}
      </div>

      {/* Add Call - bottom sheet on mobile, centered dialog on desktop */}
      <BottomSheet open={addingCall} onClose={() => { setAddingCall(false); setError(''); setNewTranscript(''); }} title="Add Call Transcript">
        <form onSubmit={handleAddCall} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Deal Stage</label>
            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
              <select
                value={newDealStage}
                onChange={e => setNewDealStage(e.target.value as DealStage)}
                className="input-field pl-10 appearance-none"
              >
                {DEAL_STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Transcript
            </label>
            <textarea
              value={newTranscript}
              onChange={e => setNewTranscript(e.target.value)}
              placeholder="Paste the call transcript here..."
              className="input-field min-h-40 font-mono text-xs resize-y"
              autoFocus
            />
          </div>
          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!newTranscript.trim()}
          >
            Review This Call
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}