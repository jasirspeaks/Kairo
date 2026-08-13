import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Phone, Calendar, Users, Clock,
  ChevronRight, Building2, UserPlus, TrendingUp, TrendingDown,
  Minus, CheckCircle2, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, Conversation, Stakeholder } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { ScheduleMeetingButton } from '../../components/ui/ScheduleMeetingButton';
import { formatDate, cn } from '../../lib/utils';

// Deal Review is a pure read. deal_state is always current because
// call-review already computed it that way on the most recent call --
// there is no refresh action anywhere in this page or the product.

const SENTIMENT_LABEL: Record<string, string> = {
  champion: 'Champion',
  supporter: 'Supporter',
  neutral: 'Neutral',
  skeptic: 'Skeptic',
  blocker: 'Blocker',
};

const SENTIMENT_COLOR: Record<string, string> = {
  champion: '#3DD68C',
  supporter: '#4F8CFF',
  neutral: '#8B93A7',
  skeptic: '#F6B23E',
  blocker: '#FF667A',
};

function formatValue(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function healthScoreColor(score: number): string {
  if (score >= 70) return '#3DD68C';
  if (score >= 40) return '#F6B23E';
  return '#FF667A';
}

// Deal Activity is a chronological read of what's already been captured
// about this deal -- every call reviewed, plus every stakeholder Kairo has
// identified -- not a separate log a user maintains by hand. No new table,
// no write path: it's a merge-and-sort view over `calls` and `stakeholders`.
type ActivityItem =
  | { kind: 'call'; id: string; at: string; call: Conversation }
  | { kind: 'stakeholder'; id: string; at: string; stakeholder: Stakeholder };

function buildActivity(calls: Conversation[], stakeholders: Stakeholder[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...calls.map((call): ActivityItem => ({ kind: 'call', id: call.id, at: call.created_at, call })),
    ...stakeholders.map((s): ActivityItem => ({ kind: 'stakeholder', id: s.id, at: s.created_at, stakeholder: s })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// --- Risk Evolution: a real timeline, not repeated card blocks --------
// One row per call that has a what_changed_since_last_call payload, in
// order. Each row is a single scannable line: a trend glyph (net risk
// direction for that call), the call's label/date, and resolved/persisting/
// new counts as compact pills. Expanding a row reveals the actual items.

type EvolutionEntry = {
  call: Conversation;
  resolved: string[];
  persists: string[];
  newRisks: string[];
};

function buildEvolution(calls: Conversation[]): EvolutionEntry[] {
  return calls
    .map(call => {
      const changed = call.analysis_json?.what_changed_since_last_call;
      if (!changed) return null;
      const hasContent = changed.resolved.length || changed.persists.length || changed.new_risks.length;
      if (!hasContent) return null;
      return { call, resolved: changed.resolved, persists: changed.persists, newRisks: changed.new_risks };
    })
    .filter((e): e is EvolutionEntry => e !== null)
    .reverse(); // newest first
}

function evolutionTrend(entry: EvolutionEntry): { icon: React.ReactNode; color: string; label: string } {
  const net = entry.resolved.length - entry.newRisks.length;
  if (net > 0) return { icon: <TrendingUp className="w-3.5 h-3.5" />, color: '#3DD68C', label: 'Improving' };
  if (net < 0) return { icon: <TrendingDown className="w-3.5 h-3.5" />, color: '#FF667A', label: 'Worsening' };
  return { icon: <Minus className="w-3.5 h-3.5" />, color: '#8B93A7', label: 'Holding steady' };
}

function EvolutionRow({ entry, defaultOpen }: { entry: EvolutionEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const trend = evolutionTrend(entry);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surfaceHigh">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span style={{ color: trend.color }} className="flex-shrink-0">{trend.icon}</span>
          <div className="min-w-0">
            <p className="text-textPrimary text-xs font-semibold truncate">
              {entry.call.deal_stage || 'Call'} · {formatDate(entry.call.created_at)}
            </p>
            <p className="text-textMuted text-xs mt-0.5" style={{ color: trend.color }}>{trend.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {entry.resolved.length > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">
              {entry.resolved.length} resolved
            </span>
          )}
          {entry.newRisks.length > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
              {entry.newRisks.length} new
            </span>
          )}
          <ChevronRight className={cn('w-3.5 h-3.5 text-textMuted transition-transform', open && 'rotate-90')} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border animate-fade-in">
          {entry.resolved.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Resolved
              </p>
              <div className="space-y-1">
                {entry.resolved.map((item, i) => (
                  <p key={i} className="text-xs text-textSecondary pl-4.5 leading-relaxed">{item}</p>
                ))}
              </div>
            </div>
          )}
          {entry.persists.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Still open
              </p>
              <div className="space-y-1">
                {entry.persists.map((item, i) => (
                  <p key={i} className="text-xs text-textSecondary pl-4.5 leading-relaxed">{item}</p>
                ))}
              </div>
            </div>
          )}
          {entry.newRisks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> New
              </p>
              <div className="space-y-1">
                {entry.newRisks.map((item, i) => (
                  <p key={i} className="text-xs text-textSecondary pl-4.5 leading-relaxed">{item}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskEvolutionPanel({ calls }: { calls: Conversation[] }) {
  const entries = buildEvolution(calls);

  if (entries.length === 0) {
    return (
      <p className="text-textMuted text-xs">
        Risk evolution appears once this deal has more than one call.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <EvolutionRow key={entry.call.id} entry={entry} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

function TimelinePanel({ calls, dealId, navigate }: { calls: Conversation[]; dealId?: string; navigate: (path: string) => void }) {
  return (
    <div className="space-y-2">
      {[...calls].reverse().map(call => {
        const callData = call.analysis_json?.call;
        return (
          <button
            key={call.id}
            onClick={() => navigate(`/app/deals/${dealId}/calls/${call.id}`)}
            className="w-full flex items-center justify-between gap-3 bg-surfaceHigh border border-border rounded-lg px-4 py-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="min-w-0">
              <p className="text-textPrimary text-xs font-medium truncate">
                {call.deal_stage || 'Call'} · {formatDate(call.created_at)}
              </p>
              {callData?.verdict && (
                <p className="text-textMuted text-xs truncate mt-0.5">{callData.verdict}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {callData?.call_status && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                  style={getStatusStyle(callData.call_status)}
                >
                  {callData.call_status}
                </span>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-textMuted" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StakeholdersPanel({ stakeholders }: { stakeholders: Stakeholder[] }) {
  if (stakeholders.length === 0) {
    return (
      <p className="text-textMuted text-xs">
        No stakeholders identified yet. They'll appear here as Kairo recognizes named people across your calls.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {stakeholders.map(s => (
        <div key={s.id} className="flex items-center justify-between gap-3 bg-surfaceHigh border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-textPrimary text-xs font-medium truncate">{s.name}</p>
              {s.role && <p className="text-textMuted text-xs truncate">{s.role}</p>}
            </div>
          </div>
          {s.sentiment && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
              style={{
                color: SENTIMENT_COLOR[s.sentiment],
                backgroundColor: `${SENTIMENT_COLOR[s.sentiment]}1A`,
                borderColor: `${SENTIMENT_COLOR[s.sentiment]}4D`,
              }}
            >
              {SENTIMENT_LABEL[s.sentiment]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DealActivityFeed({ activity, dealId, navigate }: { activity: ActivityItem[]; dealId?: string; navigate: (path: string) => void }) {
  return (
    <div>
      <h2 className="section-label mb-3">Deal Activity</h2>
      <div className="card divide-y divide-border overflow-hidden">
        {activity.map(item => {
          if (item.kind === 'call') {
            const callData = item.call.analysis_json?.call;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/app/deals/${dealId}/calls/${item.call.id}`)}
                className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:bg-surfaceHigh transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-textPrimary text-xs font-medium truncate">
                      Call reviewed · {item.call.deal_stage || 'Call'}
                    </p>
                    <span className="text-textMuted text-xs flex-shrink-0">{formatDate(item.at)}</span>
                  </div>
                  {callData?.verdict && (
                    <p className="text-textMuted text-xs truncate mt-0.5">{callData.verdict}</p>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-textMuted flex-shrink-0 mt-1" />
              </button>
            );
          }

          const s = item.stakeholder;
          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3.5">
              <div className="w-7 h-7 rounded-full bg-surfaceHigh border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                <UserPlus className="w-3.5 h-3.5 text-textMuted" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-textPrimary text-xs font-medium truncate">
                    Stakeholder identified · {s.name}
                  </p>
                  <span className="text-textMuted text-xs flex-shrink-0">{formatDate(item.at)}</span>
                </div>
                <p className="text-textMuted text-xs truncate mt-0.5">
                  {s.role || 'Role unknown'}
                  {s.sentiment && ` · ${SENTIMENT_LABEL[s.sentiment]}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MobileTab = 'overview' | 'timeline' | 'evolution' | 'stakeholders';

export function DealReview() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [nextMeeting, setNextMeeting] = useState<{ start_time: string; title: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');

  useEffect(() => {
    if (!dealId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function fetchData() {
    setLoading(true);

    const [{ data: dealData }, { data: stateData }, { data: callsData }, { data: stakeholderData }, { data: meetingData }] =
      await Promise.all([
        supabase.from('deals').select('*').eq('id', dealId).single(),
        supabase.from('deal_state').select('*').eq('deal_id', dealId).maybeSingle(),
        supabase.from('conversations').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('stakeholders').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('scheduled_meetings').select('start_time, title')
          .eq('deal_id', dealId).eq('status', 'assigned')
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true }).limit(1).maybeSingle(),
      ]);

    setDeal(dealData);
    setDealState(stateData);
    setCalls(callsData || []);
    setStakeholders(stakeholderData || []);
    setNextMeeting(meetingData || null);
    setLoading(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );

  if (!deal) return (
    <EmptyState
      icon={<AlertTriangle className="w-6 h-6" />}
      title="Deal not found"
      description="This deal doesn't exist or you don't have access to it."
      action={<Button onClick={() => navigate('/app/deals')}>Back to Deals</Button>}
    />
  );

  if (!dealState || calls.length === 0) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="-mx-4 md:hidden">
          <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
        </div>
        <EmptyState
          icon={<Phone className="w-6 h-6" />}
          title="No calls yet"
          description="Add a call transcript to this deal to see Kairo's review of where things stand."
          action={<Button onClick={() => navigate('/app/new')}>Add a Call</Button>}
        />
      </div>
    );
  }

  const lastContact = calls[calls.length - 1]?.created_at;
  const healthColor = healthScoreColor(dealState.deal_health_score ?? 0);
  const activity = buildActivity(calls, stakeholders);

  const MOBILE_TABS: { key: MobileTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'evolution', label: 'Risk Evolution' },
    { key: 'stakeholders', label: 'Stakeholders' },
  ];

  const primaryInsightCards = (
    <div className="space-y-3 md:space-y-4">
      {dealState.highest_priority_risk_full?.risk && (
        <div className="card p-4 md:p-6 border border-red-400/20">
          <h2 className="section-label mb-3">Highest Priority Risk</h2>
          <p className="text-textPrimary text-sm font-semibold mb-3">
            {dealState.highest_priority_risk_full.risk}
          </p>
          {dealState.highest_priority_risk_full.why_it_matters && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3">
              <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
              <p className="text-textSecondary text-xs leading-relaxed">
                {dealState.highest_priority_risk_full.why_it_matters}
              </p>
            </div>
          )}
        </div>
      )}

      {dealState.what_youre_missing && dealState.what_youre_missing.length > 0 && (
        <div className="card p-4 md:p-6">
          <h2 className="section-label mb-3">What's Still Missing</h2>
          <div className="space-y-3">
            {dealState.what_youre_missing.map((item, i) => (
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

      {dealState.key_follow_up_message && (
        <div className="card p-4 md:p-6">
          <h2 className="section-label mb-2">Next Recommended Action</h2>
          <p className="text-textPrimary text-sm leading-relaxed">{dealState.key_follow_up_message}</p>
        </div>
      )}

      {dealState.manager_note && (
        <div className="bg-primary/8 border border-primary/15 rounded-xl px-5 py-4">
          <p className="text-xs text-primary font-semibold mb-1">Manager Note</p>
          <p className="text-textPrimary text-sm font-medium">{dealState.manager_note}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-fade-in max-w-2xl md:max-w-5xl">
      <div className="-mx-4 md:hidden">
        <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
      </div>

      {/* Always-visible summary -- deal facts only, never toggled away */}
      <div className="card p-4 md:p-6 mb-4">
        <div className="hidden md:flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-display font-bold text-textPrimary mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {deal.company_name}
            </p>
          </div>
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-full border"
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>

        <div className="flex md:hidden items-center justify-between mb-4">
          <p className="text-textSecondary text-sm">{deal.company_name}</p>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border"
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="flex flex-col items-center md:items-start">
            <div className="relative w-16 h-16 mb-1">
              <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
                <circle
                  cx="32" cy="32" r="28" fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke={healthColor}
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - (dealState.deal_health_score ?? 0) / 100)}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-textPrimary">{dealState.deal_health_score ?? '—'}</span>
              </div>
            </div>
            <span className="text-xs text-textMuted">Health Score</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary">{formatValue(deal.deal_value)}</span>
            <span className="text-xs text-textMuted mt-0.5">Deal Value</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary">{deal.deal_stage}</span>
            <span className="text-xs text-textMuted mt-0.5">Deal Stage</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary">
              {lastContact ? formatDate(lastContact) : '—'}
            </span>
            <span className="text-xs text-textMuted mt-0.5">Last Contact</span>
          </div>
        </div>

        {nextMeeting && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-xs text-textSecondary">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            Next meeting: {nextMeeting.title || 'Scheduled call'} — {formatDate(nextMeeting.start_time)}
          </div>
        )}
      </div>

      {/* Desktop: two columns. Left = primary insight cards. Right = Timeline / Risk Evolution / Stakeholders. */}
      <div className="hidden md:grid md:grid-cols-[1fr_360px] md:gap-5 md:items-start">
        <div className="space-y-5">
          {primaryInsightCards}

          <div>
            <ScheduleMeetingButton userId={user?.id} className="w-full" />
          </div>

          {/* Deal Activity: full chronological history of this deal, newest first */}
          <DealActivityFeed activity={activity} dealId={dealId} navigate={navigate} />
        </div>

        <div className="space-y-4 sticky top-4">
          <div className="card p-4">
            <h2 className="section-label mb-3">Timeline</h2>
            <TimelinePanel calls={calls} dealId={dealId} navigate={navigate} />
          </div>
          <div className="card p-4">
            <h2 className="section-label mb-3">Risk Evolution</h2>
            <RiskEvolutionPanel calls={calls} />
          </div>
          <div className="card p-4">
            <h2 className="section-label mb-3">Stakeholders</h2>
            <StakeholdersPanel stakeholders={stakeholders} />
          </div>
        </div>
      </div>

      {/* Mobile: chip-selectable tabs. Overview = primary insight cards (default). */}
      <div className="md:hidden">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-4 -mx-4 px-4">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                mobileTab === tab.key
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-surface border-border text-textSecondary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mobileTab === 'overview' && (
          <div className="space-y-5">
            {primaryInsightCards}

            <div>
              <ScheduleMeetingButton userId={user?.id} className="w-full" />
            </div>

            <DealActivityFeed activity={activity} dealId={dealId} navigate={navigate} />
          </div>
        )}

        {mobileTab === 'timeline' && (
          <div className="card p-4">
            <TimelinePanel calls={calls} dealId={dealId} navigate={navigate} />
          </div>
        )}

        {mobileTab === 'evolution' && (
          <div className="card p-4">
            <RiskEvolutionPanel calls={calls} />
          </div>
        )}

        {mobileTab === 'stakeholders' && (
          <div className="card p-4">
            <StakeholdersPanel stakeholders={stakeholders} />
          </div>
        )}
      </div>
    </div>
  );
}