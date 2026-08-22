import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, AlertTriangle, CheckCircle, Clock,
  TrendingDown, Copy, Check, Activity, Layers, Target, Building2, ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewCall, saveDealState, saveStakeholders, getRiskLevel, getStatusStyle, resolveDealStage } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, Conversation, DEAL_STAGES, DealStage } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { ScheduleMeetingButton } from '../../components/ui/ScheduleMeetingButton';
import { formatDate } from '../../lib/utils';

// Call Status icons -- distinct from Deal Status, this describes only how
// THIS call went, not the deal's overall condition.
function getCallStatusIcon(status: string) {
  switch (status) {
    case 'On Track': return <CheckCircle className="w-4 h-4" style={{ color: '#3DD68C' }} />;
    case 'Needs Attention': return <Clock className="w-4 h-4" style={{ color: '#F6B23E' }} />;
    case 'At Risk': return <AlertTriangle className="w-4 h-4" style={{ color: '#FF667A' }} />;
    case 'Stalled': return <TrendingDown className="w-4 h-4" style={{ color: '#C97A2B' }} />;
    default: return <Activity className="w-4 h-4 text-textMuted" />;
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

      // The user can only pick stages through "Decision" -- if this call's
      // outcome reads as an unambiguous Won or Lost, promote the deal's
      // stage to the matching Closed value automatically rather than
      // leaving it on whatever stage was selected in this form.
      const resolvedStage = resolveDealStage(newDealStage, review.deal.status);

      await supabase.from('deals').update({
        deal_stage: resolvedStage,
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

  return (
    <div className="animate-fade-in w-full">

      {/* Mobile: sticky top bar with deal name -- actions live at the
          bottom of the page, not up here. */}
      <div className="-mx-4 md:hidden">
        <TopBar title={deal.deal_name} onBack={handleBack} />
      </div>

      {/* ---- Header block: identity + call status. Mirrors Deal Review's
          header -- deal name/company on the left, status pill on the
          right -- so both pages read as the same document type. */}
      <div className="mb-4 md:mb-5">
        <div className="hidden md:flex items-start justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-textPrimary mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {deal.company_name}
            </p>
          </div>
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-full border flex-shrink-0"
            style={getStatusStyle(c.call_status)}
          >
            {c.call_status}
          </span>
        </div>

        <div className="flex md:hidden items-center justify-between">
          <p className="text-textSecondary text-sm">{deal.company_name}</p>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border"
            style={getStatusStyle(c.call_status)}
          >
            {c.call_status}
          </span>
        </div>
      </div>

      {/* ---- Verdict strip: this call's own summary, in the same card
          shell as Deal Review's metrics strip -- deal stage and call date
          as the facts, verdict + reason as the read. Sticky on mobile so
          the verdict stays visible while scrolling the rest. */}
      <div className="sticky top-0 md:static z-20 -mx-4 px-4 md:mx-0 md:px-0 bg-bg pt-2 md:pt-0 pb-2 md:pb-0 md:mb-5">
        <div className="card p-4 md:p-5 w-full">
          <div className="flex items-center gap-2 mb-2.5">
            {getCallStatusIcon(c.call_status)}
            <p className="text-textMuted text-xs">
              {deal.deal_stage} · {conv.title || formatDate(conv.created_at)}
            </p>
          </div>
          <p className="text-textPrimary text-sm font-semibold mb-1 leading-snug">{c.verdict}</p>
          {c.reason && (
            <p className="text-textSecondary text-sm leading-relaxed">{c.reason}</p>
          )}
        </div>
      </div>

      {/* ---- Highest Priority Risk: hero card, same treatment as Deal
          Review -- filled accent background, icon, always visible,
          first among the findings. */}
      {c.highest_priority_risk?.risk && (
        <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 md:p-6 mb-4 md:mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">Highest Priority Risk</h2>
          </div>
          <p className="text-textPrimary text-base font-semibold mb-3 leading-snug">
            {c.highest_priority_risk.risk}
          </p>
          {c.highest_priority_risk.why_it_matters && (
            <div className="bg-bg/40 border border-red-400/15 rounded-lg p-3 mb-3">
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

      {/* ---- Missing Information -> Recommended Action -> Follow-up
          message -> Manager Note, in causal order: the gap, the move
          that closes it, the message that carries it out, then a quiet
          aside. Always visible -- Deal Review's left column follows the
          identical order and none of it hides behind a collapsible
          anymore, so the two pages don't disagree about what's worth a
          second click. */}
      <div className="space-y-4 md:space-y-5">
        {c.what_youre_missing && c.what_youre_missing.length > 0 && (
          <div className="card p-4 md:p-6">
            <h2 className="section-label mb-3">Missing Information</h2>
            <div className="space-y-3">
              {c.what_youre_missing.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-textPrimary text-xs font-medium mb-1">{item.gap}</p>
                    <p className="text-primary text-xs">Ask: "{item.question_to_answer}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {c.recommended_next_action && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-primary">Recommended Next Action</h2>
            </div>
            <p className="text-textPrimary text-sm leading-relaxed">{c.recommended_next_action}</p>
          </div>
        )}

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

        {c.manager_note && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-surfaceHigh border border-border">
            <ArrowRight className="w-3.5 h-3.5 text-textMuted flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-textMuted font-semibold mb-0.5">Manager Note</p>
              <p className="text-textSecondary text-xs leading-relaxed">{c.manager_note}</p>
            </div>
          </div>
        )}

        {/* Actions live at the bottom of the review, not the top -- the
            call's findings are the first thing the user should see. */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <ScheduleMeetingButton userId={user?.id} dealId={dealId} className="flex-1" />
          {isLatestCall && (
            <Button onClick={() => setAddingCall(true)} variant="secondary" className="flex-1">
              <Plus className="w-4 h-4" /> Add Call
            </Button>
          )}
        </div>
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