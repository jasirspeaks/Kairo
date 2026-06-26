import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, AlertTriangle, CheckCircle, Clock, TrendingDown, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewDeal, getRiskLevel, getStatusBg } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, Conversation, DealReview as DealReviewType } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate, cn } from '../../lib/utils';

export function DealReview() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [addingCall, setAddingCall] = useState(false);
  const [newTranscript, setNewTranscript] = useState('');
  const [newCallTitle, setNewCallTitle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dealId) return;
    fetchDealData();
  }, [dealId]);

  async function fetchDealData() {
    const [dealRes, stateRes, convsRes] = await Promise.all([
      supabase.from('deals').select('*').eq('id', dealId).single(),
      supabase.from('deal_state').select('*').eq('deal_id', dealId).single(),
      supabase.from('conversations').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
    ]);
    setDeal(dealRes.data);
    setDealState(stateRes.data);
    setConversations(convsRes.data || []);
    setLoading(false);
  }

  async function handleAddCall(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !deal || !newTranscript.trim()) return;

    const text = newTranscript.trim();
    if (text.length < 100) { setError('Transcript is too short.'); return; }

    setAnalyzing(true);
    setError('');

    try {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: deal.id,
          title: newCallTitle.trim() || `Call ${conversations.length + 1} — ${new Date().toLocaleDateString()}`,
          input_type: 'transcript',
          transcript: text,
          status: 'analyzing',
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to create conversation.');

      const review = await reviewDeal(text, {
        deal_name: deal.deal_name,
        company_name: deal.company_name,
        previous_review: dealState ? {
          deal_status: {
            status: dealState.current_status as any,
            confidence: dealState.confidence as any,
            reason: dealState.last_review_summary || '',
          },
          highest_priority_risk: {
            risk: dealState.highest_priority_risk || '',
            why_it_matters: '',
            evidence: '',
          },
          what_youre_missing: dealState.what_youre_missing || [],
          next_move: dealState.next_move || '',
          next_question: dealState.next_question || '',
          manager_note: dealState.manager_note || '',
          supporting_evidence: dealState.supporting_evidence || [],
        } : null,
      });

      await supabase.from('conversations').update({
        analysis_json: review,
        status: 'complete',
      }).eq('id', conv.id);

      const statePayload = {
        current_status: review.deal_status.status,
        confidence: review.deal_status.confidence,
        highest_priority_risk: review.highest_priority_risk.risk,
        highest_priority_risk_full: review.highest_priority_risk,
        what_youre_missing: review.what_youre_missing,
        next_move: review.next_move,
        next_question: review.next_question,
        manager_note: review.manager_note,
        supporting_evidence: review.supporting_evidence,
        last_review_summary: review.deal_status.reason,
        updated_at: new Date().toISOString(),
      };

      if (dealState) {
        await supabase.from('deal_state').update(statePayload).eq('deal_id', deal.id);
      } else {
        await supabase.from('deal_state').insert({ ...statePayload, deal_id: deal.id, user_id: user.id });
      }

      await supabase.from('deals').update({
        risk_level: getRiskLevel(review.deal_status.status),
        updated_at: new Date().toISOString(),
      }).eq('id', deal.id);

      setNewTranscript('');
      setNewCallTitle('');
      setAddingCall(false);
      await fetchDealData();

    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setAnalyzing(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'Healthy': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'Open': return <Clock className="w-5 h-5 text-amber-400" />;
      case 'At Risk': return <AlertTriangle className="w-5 h-5 text-red-400" />;
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

  if (!deal) return (
    <EmptyState
      icon={<AlertTriangle className="w-6 h-6" />}
      title="Deal not found"
      description="This deal doesn't exist or you don't have access to it."
      action={<Button onClick={() => navigate('/app/dashboard')}>Back to Dashboard</Button>}
    />
  );

  const review = dealState;

  // Parse full risk object if stored
  const fullRisk = (review as any)?.highest_priority_risk_full || null;

  return (
    <div className="animate-fade-in space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/app/dashboard')}
          className="flex items-center gap-1.5 text-textMuted hover:text-white text-xs mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm">
              {deal.company_name} · {conversations.length} call{conversations.length !== 1 ? 's' : ''} reviewed
            </p>
          </div>
          <Button onClick={() => setAddingCall(true)} size="sm" variant="secondary">
            <Plus className="w-3.5 h-3.5" />
            Add Call
          </Button>
        </div>
      </div>

      {/* No review yet */}
      {!review && (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No review yet"
          description="Add a call transcript to get your first deal review."
          action={<Button onClick={() => setAddingCall(true)}>Add First Call</Button>}
        />
      )}

      {review && (
        <>
          {/* Section 1 — Verdict */}
          <div className={cn(
            'card p-6 border-l-4',
            review.current_status === 'Healthy' ? 'border-emerald-400' :
            review.current_status === 'Open' ? 'border-amber-400' :
            review.current_status === 'At Risk' ? 'border-red-400' :
            'border-textMuted'
          )}>
            <div className="flex items-center gap-3 mb-3">
              {getStatusIcon(review.current_status || '')}
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-sm font-bold px-2.5 py-1 rounded-full border',
                  getStatusBg(review.current_status || '')
                )}>
                  {review.current_status}
                </span>
                <span className="text-xs text-textMuted border border-border px-2 py-1 rounded-full">
                  {review.confidence} Confidence
                </span>
              </div>
            </div>
            <p className="text-textSecondary text-sm leading-relaxed">{review.last_review_summary}</p>
          </div>

          {/* Section 2 — Highest Priority Risk */}
          {review.highest_priority_risk && (
            <div className="card p-6 border border-red-400/20">
              <h2 className="section-label mb-4">Highest Priority Risk</h2>
              <p className="text-white text-sm font-semibold mb-3">
                {review.highest_priority_risk}
              </p>
              {fullRisk?.why_it_matters && (
                <div className="bg-red-400/5 border border-red-400/15 rounded-lg p-3 mb-3">
                  <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
                  <p className="text-textSecondary text-xs leading-relaxed">{fullRisk.why_it_matters}</p>
                </div>
              )}
              {fullRisk?.evidence && (
                <div className="bg-surfaceHigh border border-border rounded-lg p-3">
                  <p className="text-xs text-textMuted font-medium mb-1">Evidence</p>
                  <p className="text-textSecondary text-xs leading-relaxed italic">"{fullRisk.evidence}"</p>
                </div>
              )}
            </div>
          )}

          {/* Section 3 — What You're Missing */}
          {review.what_youre_missing && review.what_youre_missing.length > 0 && (
            <div className="card p-6">
              <h2 className="section-label mb-4">What You're Missing</h2>
              <div className="space-y-3">
                {review.what_youre_missing.map((item, i) => (
                  <div key={i} className="bg-surfaceHigh border border-border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium mb-1.5">{item.gap}</p>
                        <p className="text-accent text-xs">Ask: "{item.question_to_answer}"</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4 — Next Move */}
          {review.next_move && (
            <div className="card p-5">
              <h2 className="section-label mb-2">Next Move</h2>
              <p className="text-white text-sm leading-relaxed">{review.next_move}</p>
            </div>
          )}

          {/* Section 5 — Next Question */}
          {review.next_question && (
            <div className="card p-5">
              <h2 className="section-label mb-2">Next Question</h2>
              <p className="text-accent text-sm leading-relaxed italic">"{review.next_question}"</p>
            </div>
          )}

          {/* Section 6 — Manager Note */}
          {review.manager_note && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-4">
              <p className="text-xs text-accent font-semibold mb-1">Manager Note</p>
              <p className="text-white text-sm font-medium">{review.manager_note}</p>
            </div>
          )}

          {/* Section 7 — Evidence (collapsed) */}
          {review.supporting_evidence && review.supporting_evidence.length > 0 && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setEvidenceOpen(!evidenceOpen)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-surfaceHigh/50 transition-colors"
              >
                <span className="text-sm font-medium text-textSecondary">Supporting Evidence</span>
                {evidenceOpen
                  ? <ChevronUp className="w-4 h-4 text-textMuted" />
                  : <ChevronDown className="w-4 h-4 text-textMuted" />
                }
              </button>
              {evidenceOpen && (
                <div className="px-6 pb-6 border-t border-border space-y-2 pt-4">
                  {review.supporting_evidence.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-textMuted flex-shrink-0 mt-2" />
                      <p className="text-textSecondary text-xs leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Call History */}
          {conversations.length > 0 && (
            <div>
              <h2 className="section-label mb-3">Call History</h2>
              <div className="space-y-2">
                {conversations.map((conv, i) => (
                  <div key={conv.id} className="card p-4 flex items-center gap-4">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{conv.title || `Call ${i + 1}`}</p>
                      <p className="text-textMuted text-xs">{formatDate(conv.created_at)}</p>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
                      conv.status === 'complete'
                        ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400'
                        : 'bg-amber-400/10 border-amber-400/20 text-amber-400'
                    )}>
                      {conv.status === 'complete' ? 'Reviewed' : 'Processing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Call Panel */}
      {addingCall && (
        <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="card w-full max-w-lg p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-display font-bold text-white">Add Call Transcript</h2>
              <button
                onClick={() => { setAddingCall(false); setError(''); setNewTranscript(''); }}
                className="text-textMuted hover:text-white transition-colors text-sm"
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
                  placeholder={`Call ${conversations.length + 1} — ${new Date().toLocaleDateString()}`}
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
                <div className="bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
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