import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Calendar, CalendarX, AlertTriangle, Clock, TrendingUp, Wallet, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle, syncGoogleCalendar } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, DealStatus, ScheduledMeeting } from '../../types';
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

function formatValue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: value >= 100000 ? 'compact' : 'standard',
  }).format(value);
}

// Side-by-side summary tile — used for Active Deals, Deals At Risk,
// Pipeline Value, and Pipeline at Risk.
function StatCard({
  label,
  value,
  displayValue,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: number;
  displayValue?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card-hover p-4 text-left flex flex-col gap-3 min-w-0"
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
      <div className="min-w-0">
        <p className="text-textPrimary text-2xl font-display font-bold leading-none truncate">
          {displayValue ?? value}
        </p>
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
    // Every time the user lands on the Dashboard, refresh their calendar
    // first -- this is the "opens the app" moment, so it's the other
    // natural place (besides Inbox) where a stale meeting should get
    // caught and reconciled before anything renders.
    syncGoogleCalendar().then(fetchData);
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

    // Active Deals on the Dashboard means: lifecycle status active, not
    // closed Won/Lost, and at least one call has actually been reviewed --
    // deal_state only exists once a review has run, so its presence is the
    // "has been reviewed" signal. A brand-new deal with only an upcoming,
    // unreviewed meeting doesn't count as active yet.
    const reviewedActiveDeals = dealsWithState.filter(d =>
      d.deal_state !== null &&
      d.deal_state.current_status !== 'Won' &&
      d.deal_state.current_status !== 'Lost'
    );

    setDeals(reviewedActiveDeals);

    const { data: meetingsData } = await supabase
      .from('scheduled_meetings')
      .select('*, deals(deal_name)')
      .eq('user_id', user!.id)
      .eq('status', 'assigned')
      .is('cancelled_at', null)
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

  // Pipeline Value: total value across active deals. Pipeline at Risk:
  // the slice of that value sitting in the same at-risk deals above --
  // what's actually exposed, not just a headcount.
  const pipelineValue = deals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
  const pipelineAtRisk = atRisk.reduce((sum, d) => sum + (d.deal_value || 0), 0);

  // Deals Requiring Attention: strict priority order by current status,
  // most critical first. Only these six statuses qualify -- Unknown,
  // Won, and Lost deals never appear in this list regardless of anything
  // else about them.
  const ATTENTION_ORDER: DealStatus[] = ['Critical', 'At Risk', 'Stalled', 'Recovering', 'Promising', 'Healthy'];

  const priorityRanked = ATTENTION_ORDER.flatMap(status =>
    deals.filter(d => d.deal_state?.current_status === status)
  ).slice(0, 10);

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
              : "Here's how your pipeline's looking."
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

            {/* Upcoming Meetings — horizontally scrollable, or an empty
                state when there's nothing on the calendar. */}
            <div>
              <h2 className="section-label mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Upcoming Meetings
              </h2>
              {meetings.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {meetings.map(m => (
                    <MeetingCard key={m.id} meeting={m} />
                  ))}
                </div>
              ) : (
                <div className="card px-4 py-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg border bg-surfaceHigh border-border flex items-center justify-center flex-shrink-0 text-textMuted">
                    <CalendarX className="w-4 h-4" />
                  </div>
                  <p className="text-textMuted text-sm">No Upcoming Meetings</p>
                </div>
              )}
            </div>

            {/* Active Deals, Deals At Risk, Pipeline Value, Pipeline at
                Risk — a 2x2 grid on mobile, one row of four on desktop. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <StatCard
                label="Pipeline Value"
                value={pipelineValue}
                displayValue={formatValue(pipelineValue)}
                icon={<Wallet className="w-4 h-4" />}
                onClick={() => navigate('/app/deals')}
              />
              <StatCard
                label="Pipeline at Risk"
                value={pipelineAtRisk}
                displayValue={formatValue(pipelineAtRisk)}
                icon={<ShieldAlert className="w-4 h-4" />}
                tone={pipelineAtRisk > 0 ? 'danger' : 'default'}
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