import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, AlertTriangle, CheckCircle, Clock, TrendingDown, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewDeal, getRiskLevel, getStatusBg } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, Conversation } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate, cn } from '../../lib/utils';

export function Review() {
  const { dealId, callId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const hideAddCall = searchParams.get('source') === 'risk-center';

  const [deal, setDeal] = useState<Deal | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [allCalls, setAllCalls] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addingCall, setAddingCall] = useState(false);
  const [newTranscript, setNewTranscript] = useState('');
  const [newCallTitle, setNewCallTitle] = useState('');
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

    setDeal(dealData);
    setAllCalls(callsData || []);

    // If callId is provided, show that specific call. Otherwise show the latest.
    const targetCall = callId
      ? (callsData || []).find(c => c.id === callId)
      : (callsData || [])[callsData!.length - 1];

    setConv(targetCall || null);
    setLoading(false);
  }

  const isLatestCall = conv && allCalls.length > 0 && conv.id === allCalls[allCalls.length - 1].id;

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

      const review = await reviewDeal(text, {
        deal_name: deal.deal_name,
        company_name: deal.company_name,
        previous_review: previousReview,
      });

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: deal.id,
          title: newCallTitle.trim() || `Call — ${new Date().toLocaleDateString()}`,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !newConv) throw new Error('Failed to save conversation.');
      convId = newConv.id;

      await supabase.from('deal_state').upsert({
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
        updated_at: new Date().toISOString(),
      }, { onConflict: 'deal_id' });

      await supabase.from('deals').update({
        risk_level: getRiskLevel(review.deal_status.status),
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id);

      setNewTranscript('');
      setNewCallTitle('');
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

  function handleBack() {
    const source = searchParams.get('source');
    if (source === 'workspace') {
      navigate(`/app/workspace/deals/${dealId}`);
    } else if (source === 'risk-center') {
      navigate('/app/risk-center');
    } else {
      navigate('/app/dashboard');
    }
  }

  function copyMessage() {
    if (!conv?.analysis_json?.key_follow_up_message) return;
    navigator.clipboard.writeText(conv.analysis_json.key_follow_up_message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'Healthy': return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      case 'Open': return <Clock className="w-5 h-5 text-amber-600" />;
      case 'At Risk': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'Lost Momentum': return <TrendingDown className="w-5 h-5 text-textMuted" />;
      default: return null;
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-t-accent border-border rounded-full animate-spin" />
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

  const r = conv.analysis_json;

  return (
    <div className="animate-fade-in space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-textMuted hover:text-textPrimary text-xs mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm">
              {deal.company_name} · {conv.title || formatDate(conv.created_at)}
            </p>
          </div>
          {!hideAddCall && isLatestCall && (
            <Button onClick={() => setAddingCall(true)} size="sm" variant="secondary">
              <Plus className="w-3.5 h-3.5" />
              Add Call
            </Button>
          )}
        </div>
      </div>

      {/* Section 1 — Verdict */}
      <div className={cn(
        'card p-6 border-l-4',
        r.deal_status.status === 'Healthy' ? 'border-emerald-400' :
        r.deal_status.status === 'Open' ? 'border-amber-400' :
        r.deal_status.status === 'At Risk' ? 'border-red-400' :
        'border-textMuted'
      )}>
        <div className="flex items-center gap-3 mb-3">
          {getStatusIcon(r.deal_status.status)}
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm font-bold px-2.5 py-1 rounded-full border',
              getStatusBg(r.deal_status.status)
            )}>
              {r.deal_status.status}
            </span>
            <span className="text-xs text-textMuted border border-border px-2 py-1 rounded-full">
              {r.deal_status.confidence} Confidence
            </span>
          </div>
        </div>
        <p className="text-textSecondary text-sm leading-relaxed">{r.deal_status.reason}</p>
      </div>

      {/* Section 2 — Highest Priority Risk */}
      {r.highest_priority_risk?.risk && (
        <div className="card p-6 border border-red-200">
          <h2 className="section-label mb-4">Highest Priority Risk</h2>
          <p className="text-textPrimary text-sm font-semibold mb-3">{r.highest_priority_risk.risk}</p>
          {r.highest_priority_risk.why_it_matters && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-3">
              <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
              <p className="text-textSecondary text-xs leading-relaxed">{r.highest_priority_risk.why_it_matters}</p>
            </div>
          )}
          {r.highest_priority_risk.evidence && (
            <div className="bg-surfaceHigh border border-border rounded-lg p-3">
              <p className="text-xs text-textMuted font-medium mb-1">Evidence</p>
              <p className="text-textSecondary text-xs leading-relaxed italic">"{r.highest_priority_risk.evidence}"</p>
            </div>
          )}
        </div>
      )}

      {/* Section 3 — What You're Missing */}
      {r.what_youre_missing && r.what_youre_missing.length > 0 && (
        <div className="card p-6">
          <h2 className="section-label mb-4">What You're Missing</h2>
          <div className="space-y-3">
            {r.what_youre_missing.map((item, i) => (
              <div key={i} className="bg-surfaceHigh border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-700 text-xs font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-textPrimary text-xs font-medium mb-1.5">{item.gap}</p>
                    <p className="text-primary text-xs">Ask: "{item.question_to_answer}"</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4 — Key Follow-up Message */}
      {r.key_follow_up_message && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">Key Follow-up Message</h2>
            <button
              onClick={copyMessage}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-textPrimary transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="bg-surfaceHigh border border-border rounded-lg p-4">
            <p className="text-textSecondary text-sm leading-relaxed whitespace-pre-line">{r.key_follow_up_message}</p>
          </div>
        </div>
      )}

      {/* Section 5 — Manager Note */}
      {r.manager_note && (
        <div className="bg-primary/8 border border-primary/15 rounded-xl px-5 py-4">
          <p className="text-xs text-primary font-semibold mb-1">Manager Note</p>
          <p className="text-textPrimary text-sm font-medium">{r.manager_note}</p>
        </div>
      )}

      {/* Section 6 — Evidence */}
      {r.supporting_evidence && r.supporting_evidence.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setEvidenceOpen(!evidenceOpen)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-surfaceHigh/60 transition-colors"
          >
            <span className="text-sm font-medium text-textSecondary">Supporting Evidence</span>
            {evidenceOpen
              ? <ChevronUp className="w-4 h-4 text-textMuted" />
              : <ChevronDown className="w-4 h-4 text-textMuted" />
            }
          </button>
          {evidenceOpen && (
            <div className="px-6 pb-6 border-t border-border space-y-2 pt-4">
              {r.supporting_evidence.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-textMuted flex-shrink-0 mt-2" />
                  <p className="text-textSecondary text-xs leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Call Panel */}
      {addingCall && (
        <div className="fixed inset-0 bg-textPrimary/20 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="card w-full max-w-lg p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-display font-bold text-textPrimary">Add Call Transcript</h2>
              <button
                onClick={() => { setAddingCall(false); setError(''); setNewTranscript(''); }}
                className="text-textMuted hover:text-textPrimary transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleAddCall} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">
                  Call Title <span className="text-textMuted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newCallTitle}
                  onChange={e => setNewCallTitle(e.target.value)}
                  placeholder="e.g. Follow Up, Demo, Negotiation"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">Transcript</label>
                <textarea
                  value={newTranscript}
                  onChange={e => setNewTranscript(e.target.value)}
                  placeholder="Paste the call transcript here..."
                  className="input-field min-h-48 font-mono text-xs resize-y"
                  autoFocus
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-red-600 text-xs">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={!newTranscript.trim()}>
                Review This Call
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}