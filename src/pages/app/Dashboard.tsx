import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Calendar, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, ScheduledMeeting } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { cn } from '../../lib/utils';

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

function formatMeetingTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const day = isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}

// Upcoming meeting card — thin, informational only, not interactive.
function MeetingCard({ meeting }: { meeting: ScheduledMeeting & { deal_name?: string } }) {
  return (
    <div className="card flex-shrink-0 w-48 px-3.5 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-primary">
        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-medium">{formatMeetingTime(meeting.start_time)}</span>
      </div>
      <p className="text-textPrimary text-sm font-medium truncate">
        {meeting.title || meeting.deal_name || 'Scheduled call'}
      </p>
      {meeting.deal_name && meeting.title && (
        <p className="text-textMuted text-xs truncate">{meeting.deal_name}</p>
      )}
    </div>
  );
}

// Side-by-side summary tile — used for Active Deals and Deals At Risk.
function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card-hover flex-1 p-4 text-left flex flex-col gap-3 min-w-0"
    >
      <div
        className={cn(
          'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0',
          tone === 'danger'
            ? 'bg-red-400/8 border-red-400/20 text-red-400'
            : 'bg-primary/8 border-primary/15 text-primary'
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-textPrimary text-2xl font-display font-bold leading-none">{value}</p>
        <p className="text-textMuted text-xs mt-1.5">{label}</p>
      </div>
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
      .limit(8);

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

  // Deals Requiring Attention: deal-risk data only -- no meetings, no Inbox
  // items. At-risk deals first, then deals with an open gap (missing info),
  // then everything else by recency.
  const missingInfo = deals.filter(d =>
    !atRisk.includes(d) &&
    d.deal_state?.what_youre_missing &&
    d.deal_state.what_youre_missing.length > 0
  );

  const priorityRanked = [...atRisk, ...missingInfo, ...deals.filter(
    d => !atRisk.includes(d) && !missingInfo.includes(d)
  )].slice(0, 10);

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar />
      </div>

      <div className="animate-fade-in">
        {/* Greeting */}
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
          <div className="space-y-6">
            <div className="flex gap-3">
              {[1, 2, 3].map(i => <div key={i} className="card h-28 w-64 flex-shrink-0 animate-pulse" />)}
            </div>
            <div className="flex gap-3">
              <div className="card h-24 flex-1 animate-pulse" />
              <div className="card h-24 flex-1 animate-pulse" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse" />)}
            </div>
          </div>
        ) : deals.length === 0 && meetings.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title="No active deals"
            description="Tap the + button below to add your first deal and paste a call transcript."
          />
        ) : (
          <div className="space-y-6">

            {/* Upcoming Meetings — horizontally scrollable */}
            {meetings.length > 0 && (
              <div>
                <h2 className="section-label mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Upcoming Meetings
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {meetings.map(m => (
                    <MeetingCard key={m.id} meeting={m} />
                  ))}
                </div>
              </div>
            )}

            {/* Active Deals + Deals At Risk — side by side */}
            <div className="flex gap-3">
              <StatCard
                label="Active Deals"
                value={deals.length}
                icon={<TrendingUp className="w-4 h-4" />}
                onClick={() => navigate('/app/deals')}
              />
              <StatCard
                label="Deals At Risk"
                value={atRisk.length}
                icon={<AlertTriangle className="w-4 h-4" />}
                tone={atRisk.length > 0 ? 'danger' : 'default'}
                onClick={() => navigate('/app/deals?status=at-risk')}
              />
            </div>

            {/* Deals Requiring Attention — priority-ranked list */}
            <div>
              <h2 className="section-label mb-3">Deals Requiring Attention</h2>
              {priorityRanked.length === 0 ? (
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