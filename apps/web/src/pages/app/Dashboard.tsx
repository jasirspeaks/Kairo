import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Calendar,
  CalendarX,
  AlertTriangle,
  Clock,
  TrendingUp,
  Wallet,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  getStatusStyle,
  syncGoogleCalendar,
  checkCalendarConnected,
  summarizePipelinePillars,
  PILLAR_LABELS,
  PILLAR_ORDER,
  getHealthScoreColor,
  formatDealValue,
} from '../../lib/kairo';
import { getDashboardDeals } from '@kairo/api';
import { markDealReviewViewed, isDealReviewViewed } from '@kairo/platform';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, DealStatus, DealPillars, ScheduledMeeting } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
  has_active_analysis?: boolean;
  has_recent_review?: boolean;
}

function RiskDot({ riskLevel }: { riskLevel: string }) {
  return (
    <div
      className={cn(
        'w-1 self-stretch rounded-full flex-shrink-0',
        riskLevel === 'high'
          ? 'bg-red-400'
          : riskLevel === 'medium'
          ? 'bg-amber-400'
          : riskLevel === 'low'
          ? 'bg-emerald-400'
          : 'bg-border'
      )}
    />
  );
}

function HealthBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="text-xs font-mono text-textMuted px-2 py-0.5 rounded bg-surfaceHigh border border-border">
        —
      </span>
    );
  }
  const color = getHealthScoreColor(score);
  return (
    <span
      className="text-xs font-mono font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
      }}
      title={`Health Score: ${score}/100`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {score}
    </span>
  );
}

function DealPillarDots({ pillars }: { pillars?: DealPillars | null }) {
  return (
    <div
      className="flex items-center gap-1"
      title="Pillars: Compelling Event, Economic Buyer, Decision Process, Budget, Champion"
    >
      {PILLAR_ORDER.map((key) => {
        const pillar = pillars?.[key];
        const status = pillar?.status;
        const color =
          status === 'confirmed'
            ? '#3DD68C'
            : status === 'partial'
            ? '#F6B23E'
            : pillars
            ? '#FF667A'
            : '#4A3B5E';
        return (
          <span
            key={key}
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
            title={`${PILLAR_LABELS[key]}: ${status || 'Unreviewed'}`}
          />
        );
      })}
    </div>
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

function NextMeetingCard({
  meeting,
  assignedDeal,
  onClickDeal,
  onClickInbox,
}: {
  meeting: ScheduledMeeting & { deal_name?: string; company_name?: string };
  assignedDeal?: DealWithState | null;
  onClickDeal: (dealId: string) => void;
  onClickInbox: () => void;
}) {
  const isUnassigned = !meeting.deal_id || meeting.status === 'unassigned';
  const meetingTime = formatMeetingTime(meeting.start_time);

  if (isUnassigned) {
    return (
      <div className="card p-4 border-amber-500/30 bg-surface flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-400">{meetingTime}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Unassigned Call
              </span>
            </div>
            <p className="text-textPrimary text-sm font-medium mt-0.5 truncate">
              {meeting.title || 'Scheduled Meeting'}
            </p>
            <p className="text-textMuted text-xs mt-0.5">
              This meeting is not linked to a deal yet.
            </p>
          </div>
        </div>
        <button
          onClick={onClickInbox}
          className="btn-secondary self-start md:self-auto text-xs py-1.5 px-3 flex items-center gap-1"
        >
          Assign in Inbox <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const dealName = assignedDeal?.deal_name || meeting.deal_name || 'Associated Deal';
  const companyName = assignedDeal?.company_name || meeting.company_name;
  const healthScore = assignedDeal?.deal_state?.deal_health_score;
  const primaryRisk = assignedDeal?.deal_state?.highest_priority_risk;
  const topQuestion = assignedDeal?.deal_state?.what_youre_missing?.[0]?.question_to_answer;
  const isAwaitingFirstCall = assignedDeal && !assignedDeal.deal_state;

  return (
    <div
      onClick={() => meeting.deal_id && onClickDeal(meeting.deal_id)}
      className="card-hover p-4 border-primary/30 bg-surface flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-lg border border-primary/30 bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
          <Clock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-primary">{meetingTime}</span>
            <span className="text-xs text-textMuted">•</span>
            <span className="text-xs font-medium text-textSecondary truncate">{dealName}</span>
            {companyName && (
              <span className="text-xs text-textMuted hidden sm:inline">({companyName})</span>
            )}
          </div>
          <p className="text-textPrimary text-sm font-semibold mt-0.5 truncate">
            {meeting.title || 'Scheduled call'}
          </p>
          {primaryRisk ? (
            <p className="text-xs text-amber-400 mt-1 truncate">
              <span className="text-textMuted font-medium">Highest priority risk:</span> {primaryRisk}
            </p>
          ) : topQuestion ? (
            <p className="text-xs text-textSecondary mt-1 truncate">
              <span className="text-textMuted font-medium">Question to answer:</span> "{topQuestion}"
            </p>
          ) : isAwaitingFirstCall ? (
            <p className="text-xs text-textMuted mt-1">Awaiting first call review</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 self-end md:self-center flex-shrink-0">
        {healthScore != null && <HealthBadge score={healthScore} />}
        <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:text-primaryHover">
          View deal <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}

function PillarOverviewGrid({
  deals,
  onPillarClick,
}: {
  deals: DealWithState[];
  onPillarClick: (pillarKey: string) => void;
}) {
  const summaries = summarizePipelinePillars(deals);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label flex items-center gap-1.5">
          5-Pillar Overview
        </h2>
        <span className="text-xs text-textMuted">
          Across {deals.length} active {deals.length === 1 ? 'deal' : 'deals'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {summaries.map((summary) => {
          const ratioText = `${summary.confirmedCount} of ${summary.totalDeals} confirmed`;
          const confirmedPct =
            summary.totalDeals > 0
              ? (summary.confirmedCount / summary.totalDeals) * 100
              : 0;
          const partialPct =
            summary.totalDeals > 0
              ? (summary.partialCount / summary.totalDeals) * 100
              : 0;

          return (
            <button
              key={summary.key}
              onClick={() => onPillarClick(summary.key)}
              className="card-hover p-3.5 text-left flex flex-col justify-between min-h-[96px] group"
            >
              <div>
                <p className="text-xs font-semibold text-textPrimary group-hover:text-primary transition-colors">
                  {summary.label}
                </p>
                <p className="text-xs font-medium text-textSecondary mt-1">
                  {ratioText}
                </p>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surfaceHigh overflow-hidden flex mt-3">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${confirmedPct}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{ width: `${partialPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttentionDealRow({
  deal,
  onClick,
}: {
  deal: DealWithState;
  onClick: () => void;
}) {
  const currentStatus = deal.deal_state?.current_status || 'Unknown';
  const score = deal.deal_state?.deal_health_score;
  const isAwaitingFirstCall = !deal.deal_state;

  return (
    <button
      onClick={onClick}
      className="card-hover w-full flex items-center gap-3 pl-0 pr-4 py-3 text-left group overflow-hidden min-h-[64px]"
    >
      <RiskDot riskLevel={deal.risk_level} />
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-textPrimary text-sm font-semibold truncate">{deal.deal_name}</p>
          {deal.company_name && (
            <span className="text-textMuted text-xs truncate">({deal.company_name})</span>
          )}
          {deal.has_active_analysis ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-center gap-1 flex-shrink-0">
              Analyzing
            </span>
          ) : deal.has_recent_review ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center gap-1 flex-shrink-0">
              Review ready
            </span>
          ) : null}
        </div>
        {deal.deal_state?.highest_priority_risk ? (
          <p className="text-textMuted text-xs truncate mt-0.5">
            {deal.deal_state.highest_priority_risk}
          </p>
        ) : deal.deal_state?.what_youre_missing?.[0]?.gap ? (
          <p className="text-textMuted text-xs truncate mt-0.5">
            {deal.deal_state.what_youre_missing[0].gap}
          </p>
        ) : isAwaitingFirstCall ? (
          <p className="text-textMuted text-xs mt-0.5">Awaiting first call</p>
        ) : (
          <p className="text-textMuted text-xs mt-0.5">{deal.company_name || 'No risks recorded'}</p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:flex flex-col items-end gap-1">
          <DealPillarDots pillars={deal.deal_state?.pillars} />
        </div>
        <HealthBadge score={score} />
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full border self-center flex-shrink-0"
          style={getStatusStyle(currentStatus)}
        >
          {currentStatus}
        </span>
        <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton p-4 h-20" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton p-4 h-24" />
        ))}
      </div>
      <div>
        <div className="h-3.5 w-32 rounded bg-surfaceHigh mb-3" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton p-3.5 h-24" />
          ))}
        </div>
      </div>
      <div>
        <div className="h-3.5 w-44 rounded bg-surfaceHigh mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton p-4 h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [meetings, setMeetings] = useState<(ScheduledMeeting & { deal_name?: string; company_name?: string })[]>([]);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    syncGoogleCalendar().then(fetchData);

    const channel = supabase
      .channel('dashboard-conversations-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const handleDealViewed = () => {
      fetchData();
    };
    window.addEventListener('kairo-deal-viewed', handleDealViewed);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('kairo-deal-viewed', handleDealViewed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    if (!user) return;
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const [reviewedActiveDeals, activeConvsRes, recentReviewsRes, meetingsRes, isCalConnected] = await Promise.all([
      getDashboardDeals(user.id),
      supabase
        .from('conversations')
        .select('deal_id')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing', 'retry_pending']),
      supabase
        .from('conversations')
        .select('deal_id, created_at')
        .eq('user_id', user.id)
        .eq('status', 'complete')
        .gte('created_at', twoHoursAgo),
      supabase
        .from('meetings')
        .select('*, deals(deal_name, company_name)')
        .eq('user_id', user.id)
        .in('status', ['assigned', 'unassigned', 'scheduled'])
        .is('cancelled_at', null)
        .gte('start_time', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(8),
      checkCalendarConnected(user.id).catch(() => false),
    ]);

    const activeSet = new Set((activeConvsRes.data || []).map((c) => c.deal_id).filter(Boolean));
    const recentSet = new Set(
      (recentReviewsRes.data || [])
        .filter((c: any) => c.deal_id && !isDealReviewViewed(c.deal_id, c.created_at))
        .map((c: any) => c.deal_id)
    );

    const enrichedDeals: DealWithState[] = (reviewedActiveDeals || []).map((deal: any) => ({
      ...deal,
      has_active_analysis: activeSet.has(deal.id),
      has_recent_review: recentSet.has(deal.id) && !activeSet.has(deal.id),
    }));

    setDeals(enrichedDeals);
    setMeetings(
      (meetingsRes.data || []).map((m: any) => ({
        ...m,
        deal_name: m.deals?.deal_name,
        company_name: m.deals?.company_name,
      }))
    );
    setCalendarConnected(isCalConnected);
    setLoading(false);
  }

  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 17
      ? 'Good afternoon'
      : 'Good evening';

  const atRisk = deals.filter(
    (d) =>
      d.deal_state?.current_status &&
      ['At Risk', 'Critical', 'Stalled'].includes(d.deal_state.current_status)
  );

  const pipelineValue = deals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
  const pipelineAtRisk = atRisk.reduce((sum, d) => sum + (d.deal_value || 0), 0);

  const ATTENTION_ORDER: DealStatus[] = ['Critical', 'At Risk', 'Stalled', 'Unknown'];
  const priorityRanked = ATTENTION_ORDER.flatMap((status) =>
    deals.filter((d) => (d.deal_state?.current_status || 'Unknown') === status)
  ).slice(0, 10);

  const nextMeeting = meetings.length > 0 ? meetings[0] : null;
  const nextMeetingDeal = nextMeeting?.deal_id
    ? deals.find((d) => d.id === nextMeeting.deal_id)
    : null;

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar />
      </div>

      <div className="animate-fade-in">
        {/* Greeting Header */}
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-display font-bold text-textPrimary mb-1">
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-textSecondary text-sm">
            {deals.length === 0
              ? 'No active deals yet. Tap + to add your first.'
              : "Here's how your pipeline's looking."}
          </p>
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : deals.length === 0 && meetings.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title="No active deals"
            description="Tap the + button below to add your first deal and start reviewing calls."
          />
        ) : (
          <div className="space-y-6">
            {/* Upcoming Meeting / Next Call */}
            <div>
              <h2 className="section-label mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Upcoming Call
              </h2>
              {nextMeeting ? (
                <div className="space-y-3">
                  <NextMeetingCard
                    meeting={nextMeeting}
                    assignedDeal={nextMeetingDeal}
                    onClickDeal={(dealId) => {
                      markDealReviewViewed(dealId);
                      navigate(`/app/deals/${dealId}`);
                    }}
                    onClickInbox={() => navigate('/app/inbox')}
                  />
                  {meetings.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
                      {meetings.slice(1, 5).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (m.deal_id) {
                              markDealReviewViewed(m.deal_id);
                              navigate(`/app/deals/${m.deal_id}`);
                            }
                          }}
                          className="card px-3 py-2 text-left flex items-center gap-2 flex-shrink-0 hover:border-primary/40 transition-colors"
                        >
                          <span className="text-xs font-semibold text-primary">
                            {formatMeetingTime(m.start_time)}
                          </span>
                          <span className="text-xs text-textPrimary truncate max-w-[160px]">
                            {m.deal_name || m.title || 'Scheduled call'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : calendarConnected === false ? (
                <div className="card p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg border bg-surfaceHigh border-border flex items-center justify-center flex-shrink-0 text-textMuted">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-textPrimary text-sm font-medium">Google Calendar not connected</p>
                      <p className="text-textMuted text-xs">Connect in Settings to automatically sync upcoming meetings.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/app/settings')}
                    className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0"
                  >
                    Connect Calendar
                  </button>
                </div>
              ) : (
                <div className="card px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg border bg-surfaceHigh border-border flex items-center justify-center flex-shrink-0 text-textMuted">
                    <CalendarX className="w-4 h-4" />
                  </div>
                  <p className="text-textMuted text-sm">No upcoming meetings scheduled</p>
                </div>
              )}
            </div>

            {/* Pipeline Overview Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Active Deals"
                value={deals.length}
                icon={<TrendingUp className="w-4 h-4" />}
                onClick={() => navigate('/app/deals')}
              />
              <StatCard
                label="Deals at Risk"
                value={atRisk.length}
                icon={<AlertTriangle className="w-4 h-4" />}
                tone={atRisk.length > 0 ? 'danger' : 'default'}
                onClick={() => navigate('/app/deals?status=at-risk')}
              />
              <StatCard
                label="Pipeline Value"
                value={pipelineValue}
                displayValue={formatDealValue(pipelineValue)}
                icon={<Wallet className="w-4 h-4" />}
                onClick={() => navigate('/app/deals')}
              />
              <StatCard
                label="Pipeline at Risk"
                value={pipelineAtRisk}
                displayValue={formatDealValue(pipelineAtRisk)}
                icon={<ShieldAlert className="w-4 h-4" />}
                tone={pipelineAtRisk > 0 ? 'danger' : 'default'}
                onClick={() => navigate('/app/deals?status=at-risk')}
              />
            </div>

            {/* 5-Pillar Overview */}
            {deals.length > 0 && (
              <PillarOverviewGrid
                deals={deals}
                onPillarClick={() => navigate('/app/deals')}
              />
            )}

            {/* Deals Requiring Attention */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-label">Deals Requiring Attention</h2>
                {priorityRanked.length > 0 && (
                  <span className="text-xs text-textMuted font-mono">
                    {priorityRanked.length} {priorityRanked.length === 1 ? 'deal' : 'deals'}
                  </span>
                )}
              </div>

              {priorityRanked.length === 0 ? (
                <div className="card p-6 text-center">
                  <p className="text-textSecondary text-sm font-medium">All active deals are healthy or promising</p>
                  <p className="text-textMuted text-xs mt-1">No critical risks or stalled deals detected.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {priorityRanked.map((deal) => (
                    <AttentionDealRow
                      key={deal.id}
                      deal={deal}
                      onClick={() => {
                        markDealReviewViewed(deal.id);
                        navigate(`/app/deals/${deal.id}`);
                      }}
                    />
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