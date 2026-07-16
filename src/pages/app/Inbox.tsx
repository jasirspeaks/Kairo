import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox as InboxIcon, Building2, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { reviewDeal, getRiskLevel } from '../../lib/kairo';
import { Deal, Conversation, PendingCall } from '../../types';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { formatDate, cn } from '../../lib/utils';

export function Inbox() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [pendingCalls, setPendingCalls] = useState<PendingCall[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingCall | null>(null);

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [newDealName, setNewDealName] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const [{ data: pending }, { data: dealsData }] = await Promise.all([
      supabase
        .from('pending_calls')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'unmatched')
        .order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
    ]);
    setPendingCalls(pending || []);
    setDeals(dealsData || []);
    setLoading(false);
  }

  function openCall(call: PendingCall) {
    setSelected(call);
    setMode('existing');
    setSelectedDealId('');
    setNewDealName('');
    setNewCompanyName('');
    setError('');
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selected) return;

    if (mode === 'existing' && !selectedDealId) {
      setError('Select a deal to assign this call to.');
      return;
    }
    if (mode === 'new' && (!newDealName.trim() || !newCompanyName.trim())) {
      setError('Deal name and company name are required.');
      return;
    }

    setProcessing(true);
    setError('');

    let dealId = selectedDealId;
    let createdDealId: string | null = null;

    try {
      if (mode === 'new') {
        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .insert({
            user_id: user.id,
            deal_name: newDealName.trim(),
            company_name: newCompanyName.trim(),
            status: 'active',
            risk_level: 'none',
          })
          .select()
          .single();

        if (dealError || !deal) throw new Error('Failed to create deal.');
        dealId = deal.id;
        createdDealId = deal.id;
      }

      const { data: dealRow } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (!dealRow) throw new Error('Deal not found.');

      const { data: existingCalls } = await supabase
        .from('conversations')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      const calls: Conversation[] = existingCalls || [];
      const previousReview = calls.length > 0 ? calls[calls.length - 1].analysis_json : null;

      const review = await reviewDeal(selected.transcript, {
        deal_name: dealRow.deal_name,
        company_name: dealRow.company_name,
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
          deal_id: dealId,
          title: selected.title || `Call ${calls.length + 1} — ${new Date().toLocaleDateString()}`,
          input_type: 'transcript',
          transcript: selected.transcript,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !newConv) throw new Error('Failed to save conversation.');

      await supabase.from('deal_state').upsert({
        deal_id: dealId,
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
      }).eq('id', dealId);

      await supabase.from('pending_calls').update({
        status: 'matched',
        matched_deal_id: dealId,
        matched_conversation_id: newConv.id,
        updated_at: new Date().toISOString(),
      }).eq('id', selected.id);

      navigate(`/app/deals/${dealId}/calls/${newConv.id}?source=workspace`);

    } catch (err: any) {
      if (createdDealId) {
        await supabase.from('deals').delete().eq('id', createdDealId);
      }
      setError(err.message || 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  }

  if (processing) return (
    <div className="min-h-[calc(100vh-64px)]">
      <LoadingState phase="analyzing" />
    </div>
  );

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar title="Inbox" />
      </div>

      <div className="animate-fade-in">
        <div className="mb-6 hidden md:block">
          <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Inbox</h1>
          <p className="text-textSecondary text-sm">
            Calls pulled in automatically, waiting to be assigned to a deal.
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="card h-20 animate-pulse" />)}
          </div>
        ) : pendingCalls.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="w-6 h-6" />}
            title="Inbox is empty"
            description="New calls pulled in automatically will show up here for you to assign to a deal."
          />
        ) : (
          <div className="space-y-2">
            {pendingCalls.map(call => (
              <button
                key={call.id}
                onClick={() => openCall(call)}
                className="card-hover w-full flex items-center gap-3 px-4 py-3 text-left group min-h-[64px]"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                  <InboxIcon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-textPrimary text-sm font-medium truncate">
                    {call.title || 'Untitled Call'}
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    {call.meeting_date ? formatDate(call.meeting_date) : formatDate(call.created_at)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assign Call - bottom sheet */}
      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Assign Call"
      >
        {selected && (
          <>
            <p className="text-textSecondary text-sm mb-4 truncate">
              {selected.title || 'Untitled Call'}
            </p>

            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={cn(
                  'flex-1 text-xs font-medium px-3 py-2.5 rounded-lg border transition-colors min-h-[44px]',
                  mode === 'existing'
                    ? 'bg-primary/8 border-primary/30 text-primary'
                    : 'border-border text-textMuted'
                )}
              >
                Existing Deal
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={cn(
                  'flex-1 text-xs font-medium px-3 py-2.5 rounded-lg border transition-colors min-h-[44px]',
                  mode === 'new'
                    ? 'bg-primary/8 border-primary/30 text-primary'
                    : 'border-border text-textMuted'
                )}
              >
                New Deal
              </button>
            </div>

            <form onSubmit={handleAssign} className="space-y-4">
              {mode === 'existing' ? (
                <div>
                  <label className="block text-xs font-medium text-textSecondary mb-1.5">Deal</label>
                  <select
                    value={selectedDealId}
                    onChange={e => setSelectedDealId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select a deal</option>
                    {deals.map(deal => (
                      <option key={deal.id} value={deal.id}>
                        {deal.deal_name} — {deal.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-textSecondary mb-1.5">
                      Deal Name
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                      <input
                        type="text"
                        value={newDealName}
                        onChange={e => setNewDealName(e.target.value)}
                        placeholder="e.g. Acme Corp — Enterprise Plan"
                        className="input-field pl-10"
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
                        value={newCompanyName}
                        onChange={e => setNewCompanyName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="input-field pl-10"
                      />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-red-600 text-xs">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" size="lg">
                Review This Call
              </Button>
            </form>
          </>
        )}
      </BottomSheet>
    </>
  );
}