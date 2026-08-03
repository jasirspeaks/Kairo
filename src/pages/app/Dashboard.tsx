import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, ScheduledMeeting } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { formatDate, cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
}

function RiskDot({ riskLevel }: { riskLevel: string }) {
  return (
    <div className={cn(
      'w-1 self-stretch rounded-full flex-shrink-0',
      riskLevel === 'high' ? 'bg-red-400' :
      riskLevel === 'medium' ? 'bg-amber-400' :
      riskLevel === 'low' ? 'bg-emerald-400' :
      'bg-border'
    )} />
  );
}

function DealRow({ deal, onClick }: { deal: DealWithState; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card-hover w-full flex items-stretch gap-3 pl-0 pr-4 py-3 text-left group overflow-hidden min-h-[64px]"
    >
      <RiskDot riskLevel={deal.risk_level} />
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <p className="text-textPrimary text-sm font-medium truncate">{deal.deal_name}</p>
        {deal.deal_state?.highest_priority_risk ? (
          <p className="text-textMuted text-xs truncate mt-0.5">{deal.deal_state.highest_priority_risk}</p>
        ) : (
          <p className="text-textMuted text-xs mt-0.5">{deal.company_name}</p>
        )}
      </div>
      {deal.deal_state?.current_status && (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full border self-center flex-shrink-0"
          style={getStatusStyle(deal.deal_state.current_status)}
        >
          {deal.deal_state.current_status}
        </span>
      )}
      <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors flex-shrink-0 self-center" />
    </button>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [meetings, setMeetings] = useState<(ScheduledMeeting & { deal_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    const { data: dealsData } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    const dealsWithState: DealWithState[] = dealsData
      ? await Promise.all(
          dealsData.map(async (deal) => {
            const { data: state } = await supabase
              .from('deal_state')
              .select('*')
              .eq('deal_id', deal.id)
              .maybeSingle();
            return { ...deal, deal_state: state };
          })
        )
      : [];

    setDeals(dealsWithState);

    const { data: meetingsData } = await supabase
      .from('scheduled_meetings')
      .select('*, deals(deal_name)')
      .eq('user_id', user!.id)
      .eq('status', 'assigned')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(5);

    setMeetings(
      (meetingsData || []).map((m: any) => ({ ...m, deal_name: m.deals?.deal_name }))
    );

    setLoading(false);
  }

  const greeting = new Date().getHours() < 12
    ? 'Good morning'
    : new Date().getHours() < 17
    ? 'Good afternoon'
    : 'Good evening';

  // Deals At Risk: current status is meaningfully unhealthy right now.
  const atRisk = deals.filter(d =>
    d.deal_state?.current_status && ['At Risk', 'Critical', 'Stalled'].includes(d.deal_state.current_status)
  );

  // Deals Requiring Attention: everything else with an open gap or missing
  // info, even if not formally "at risk" -- distinct from atRisk so a
  // Healthy deal with an unanswered question still surfaces here.
  const needsAttention = deals.filter(d =>
    !atRisk.includes(d) &&
    d.deal_state?.what_youre_missing &&
    d.deal_state.what_youre_missing.length > 0
  );

  // Priority-ranked: at-risk first, then needs-attention, then the rest by
  // recency -- answers "which deals need my attention right now" directly.
  const priorityRanked = [...atRisk, ...needsAttention, ...deals.filter(
    d => !atRisk.includes(d) && !needsAttention.includes(d)
  )].slice(0, 8);

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar />
      </div>

      <div className="animate-fade-in">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-display font-bold text-textPrimary mb-1">
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-textSecondary text-sm">
            {deals.length === 0
              ? 'No active deals yet. Tap + to add your first.'
              : atRisk.length > 0
              ? `${atRisk.length} deal${atRisk.length !== 1 ? 's' : ''} need${atRisk.length === 1 ? 's' : ''} attention.`
              : `${deals.length} active deal${deals.length !== 1 ? 's' : ''} — all looking good.`
            }
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse" />)}
          </div>
        ) : deals.length === 0 && meetings.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title="No active deals"
            description="Tap the + button below to add your first deal and paste a call transcript."
          />
        ) : (
          <div className="space-y-6">

            {meetings.length > 0 && (
              <div>
                <h2 className="section-label mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Upcoming Meetings
                </h2>
                <div className="space-y-2">
                  {meetings.map(m => (
                    <div key={m.id} className="card p-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-textPrimary text-sm font-medium truncate">
                          {m.title || m.deal_name || 'Scheduled call'}
                        </p>
                        <p className="text-textMuted text-xs">
                          {m.start_time ? formatDate(m.start_time) : ''}
                          {m.deal_name && m.title ? ` · ${m.deal_name}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {atRisk.length > 0 && (
              <div>
                <h2 className="section-label mb-3 flex items-center gap-1.5 text-red-500">
                  <AlertTriangle className="w-3.5 h-3.5" /> Deals At Risk
                </h2>
                <div className="space-y-2">
                  {atRisk.map(deal => (
                    <DealRow key={deal.id} deal={deal} onClick={() => navigate(`/app/deals/${deal.id}`)} />
                  ))}
                </div>
              </div>
            )}

            {needsAttention.length > 0 && (
              <div>
                <h2 className="section-label mb-3 text-amber-600">Deals Requiring Attention</h2>
                <div className="space-y-2">
                  {needsAttention.map(deal => (
                    <DealRow key={deal.id} deal={deal} onClick={() => navigate(`/app/deals/${deal.id}`)} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="section-label mb-3">Active Deals</h2>
              {deals.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="w-6 h-6" />}
                  title="No active deals"
                  description="Tap the + button below to add your first deal and paste a call transcript."
                />
              ) : (
                <div className="space-y-2">
                  {priorityRanked.map(deal => (
                    <DealRow key={deal.id} deal={deal} onClick={() => navigate(`/app/deals/${deal.id}`)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}