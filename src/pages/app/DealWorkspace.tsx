import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Phone, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { reviewDeal, getRiskLevel, getStatusBg } from '../../lib/kairo';
import { Deal, DealState, Conversation } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { formatDate, cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
  last_call_date: string | null;
}

export function DealWorkspace() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<DealWithState | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalls, setLoadingCalls] = useState(false);

  // Add call state
  const [addingCall, setAddingCall] = useState(false);
  const [newTranscript, setNewTranscript] = useState('');
  const [newCallTitle, setNewCallTitle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchDeals() {
    const { data: dealsData } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (!dealsData) { setLoading(false); return; }

    const dealsWithState = await Promise.all(
      dealsData.map(async (deal) => {
        const { data: state } = await supabase
          .from('deal_state')
          .select('*')
          .eq('deal_id', deal.id)
          .single();

        const { data: lastCall } = await supabase
          .from('conversations')
          .select('created_at')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...deal,
          deal_state: state,
          last_call_date: lastCall?.created_at || null,
        };
      })
    );

    setDeals(dealsWithState);
    setLoading(false);
  }

  async function handleSelectDeal(deal: DealWithState) {
    setSelectedDeal(deal);
    setLoadingCalls(true);

    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: true });

    setConversations(data || []);
    setLoadingCalls(false);
  }

  async function handleAddCall(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedDeal || !newTranscript.trim()) return;

    const text = newTranscript.trim();
    if (text.length < 100) { setError('Transcript is too short.'); return; }

    setAnalyzing(true);
    setError('');

    let convId: string | null = null;

    try {
      const latestCall = conversations[conversations.length - 1];
      const previousReview = latestCall?.analysis_json || null;

      const review = await reviewDeal(text, {
        deal_name: selectedDeal.deal_name,
        company_name: selectedDeal.company_name,
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
          deal_id: selectedDeal.id,
          title: newCallTitle.trim() || `Call ${conversations.length + 1} — ${new Date().toLocaleDateString()}`,
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
        deal_id: selectedDeal.id,
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
      }).eq('id', selectedDeal.id);

      setNewTranscript('');
      setNewCallTitle('');
      setAddingCall(false);

      navigate(`/app/deals/${selectedDeal.id}/calls/${newConv.id}?source=workspace`);

    } catch (err: any) {
      if (convId) {
        await supabase.from('conversations').delete().eq('id', convId);
      }
      setError(err.message || 'Something went wrong.');
    } finally {
      setAnalyzing(false);
    }
  }

  if (analyzing) return (
    <div className="min-h-[calc(100vh-64px)]">
      <LoadingState phase="analyzing" />
    </div>
  );

  // Deal list view
  if (!selectedDeal) {
    return (
      <>
        <div className="-mx-4 md:hidden">
          <TopBar title="Deal Workspace" />
        </div>

        <div className="animate-fade-in">
          <div className="mb-6 hidden md:block">
            <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Deal Workspace</h1>
            <p className="text-textSecondary text-sm">All your deals and their call history.</p>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="card h-20 animate-pulse" />)}
            </div>
          ) : deals.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-6 h-6" />}
              title="No deals yet"
              description="Tap the + button below to create your first deal."
            />
          ) : (
            <div className="space-y-2">
              {deals.map(deal => (
                <button
                  key={deal.id}
                  onClick={() => handleSelectDeal(deal)}
                  className="card-hover w-full flex items-stretch gap-3 pl-0 pr-4 py-3 text-left group min-h-[64px] overflow-hidden"
                >
                  <div className={cn(
                    'w-1 self-stretch rounded-full flex-shrink-0',
                    deal.risk_level === 'high' ? 'bg-red-400' :
                    deal.risk_level === 'medium' ? 'bg-amber-400' :
                    deal.risk_level === 'low' ? 'bg-emerald-400' :
                    'bg-border'
                  )} />

                  <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-textPrimary text-sm font-medium truncate">{deal.deal_name}</p>
                      {deal.deal_state?.current_status && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0',
                          getStatusBg(deal.deal_state.current_status)
                        )}>
                          {deal.deal_state.current_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-textMuted text-xs truncate">{deal.company_name}</p>
                      {deal.deal_state?.highest_priority_risk && (
                        <>
                          <span className="text-textMuted text-xs hidden sm:inline">·</span>
                          <p className="text-textMuted text-xs truncate hidden sm:block">
                            {deal.deal_state.highest_priority_risk}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors flex-shrink-0 self-center" />
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // Call list view
  return (
    <div className="animate-fade-in">
      <div className="-mx-4 md:hidden">
        <TopBar
          title={selectedDeal.deal_name}
          onBack={() => { setSelectedDeal(null); setConversations([]); }}
          action={
            <button
              onClick={() => setAddingCall(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Plus className="w-4 h-4" />
            </button>
          }
        />
      </div>

      <div className="mb-6 hidden md:block">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
              {selectedDeal.deal_name}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-textSecondary text-sm">{selectedDeal.company_name}</p>
              {selectedDeal.deal_state?.current_status && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full border',
                  getStatusBg(selectedDeal.deal_state.current_status)
                )}>
                  {selectedDeal.deal_state.current_status}
                </span>
              )}
            </div>
          </div>
          <Button onClick={() => setAddingCall(true)} size="sm" variant="secondary">
            <Plus className="w-3.5 h-3.5" />
            Add Call
          </Button>
        </div>
      </div>

      {/* Mobile-only company/status subheader */}
      <div className="flex items-center gap-2 mb-4 md:hidden">
        <p className="text-textSecondary text-sm">{selectedDeal.company_name}</p>
        {selectedDeal.deal_state?.current_status && (
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full border',
            getStatusBg(selectedDeal.deal_state.current_status)
          )}>
            {selectedDeal.deal_state.current_status}
          </span>
        )}
      </div>

      {loadingCalls ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<Phone className="w-6 h-6" />}
          title="No calls yet"
          description="Add your first call transcript to get a deal review."
          action={
            <Button onClick={() => setAddingCall(true)}>
              <Plus className="w-4 h-4" />
              Add First Call
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((conv, i) => {
            const review = conv.analysis_json;
            return (
              <button
                key={conv.id}
                onClick={() => navigate(`/app/deals/${selectedDeal.id}/calls/${conv.id}?source=workspace`)}
                className="card-hover w-full flex items-center gap-3 px-4 py-3 text-left group min-h-[64px]"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-textPrimary text-sm font-medium truncate">
                      {conv.title || `Call ${i + 1}`}
                    </p>
                    {review?.deal_status?.status && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0',
                        getStatusBg(review.deal_status.status)
                      )}>
                        {review.deal_status.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-textMuted text-xs">{formatDate(conv.created_at)}</p>
                    {review?.highest_priority_risk?.risk && (
                      <>
                        <span className="text-textMuted text-xs hidden sm:inline">·</span>
                        <p className="text-textMuted text-xs truncate hidden sm:block">
                          {review.highest_priority_risk.risk}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Add Call - bottom sheet */}
      <BottomSheet
        open={addingCall}
        onClose={() => { setAddingCall(false); setError(''); setNewTranscript(''); }}
        title="Add Call Transcript"
      >
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
              className="input-field min-h-40 font-mono text-xs resize-y"
              autoFocus
            />
          </div>
          {error && (
            <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-600 text-xs">{error}</p>
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={!newTranscript.trim()}>
            Review This Call
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}