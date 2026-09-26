import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Phone, Users, Clock, Target,
  ChevronRight, Building2, UserPlus, TrendingUp, TrendingDown,
  Minus, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { Deal, DealState, Conversation, Stakeholder, DealPillars, PillarState } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
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

// --- What We Know So Far: five-pillar qualification strip -------------
// One full-width bar per pillar. Bar length and color are driven by the
// continuous 0-100 confidence score, not the status label -- status
// still exists in the data for the Dashboard's cross-deal aggregate, but
// this strip deliberately shows no status word, just the bar and a
// chevron, so the read is purely visual. not_yet_relevant pillars get a
// flat hatched bar instead of a point on the red-to-green scale, since
// "too early to know" isn't a point of weakness.

const PILLAR_LABELS: Record<keyof DealPillars, string> = {
  compelling_event: 'Compelling Event',
  economic_buyer: 'Economic Buyer',
  decision_process: 'Decision Process',
  budget: 'Budget',
  champion: 'Champion',
};

const PILLAR_ORDER: (keyof DealPillars)[] = [
  'compelling_event', 'economic_buyer', 'decision_process', 'budget', 'champion',
];

function pillarBarColor(confidence: number): string {
  if (confidence >= 67) return '#3DD68C';
  if (confidence >= 34) return '#F6B23E';
  return '#FF667A';
}

function PillarBar({ label, pillar }: { label: string; pillar: PillarState }) {
  const [open, setOpen] = useState(false);
  const isNotYetRelevant = pillar.status === 'not_yet_relevant';
  const hasEvidence = !!pillar.evidence;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => hasEvidence && setOpen(v => !v)}
        className={cn(
          'w-full text-left py-3',
          hasEvidence ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-textPrimary text-xs font-semibold">{label}</span>
          {hasEvidence && (
            <ChevronRight
              className={cn('w-3.5 h-3.5 text-textMuted transition-transform flex-shrink-0', open && 'rotate-90')}
            />
          )}
        </div>
        <div className="h-1.5 rounded-full bg-surfaceHigh overflow-hidden">
          {isNotYetRelevant ? (
            <div
              className="h-full w-full rounded-full"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #3A3450 0, #3A3450 5px, #2A2438 5px, #2A2438 10px)',
              }}
            />
          ) : (
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pillar.confidence}%`, backgroundColor: pillarBarColor(pillar.confidence) }}
            />
          )}
        </div>
      </button>

      {open && hasEvidence && (
        <div className="pb-3 -mt-0.5 animate-fade-in">
          <p className="text-textSecondary text-xs leading-relaxed bg-surfaceHigh border border-border rounded-lg px-3 py-2.5">
            {pillar.evidence}
          </p>
        </div>
      )}
    </div>
  );
}

function PillarStrip({ pillars }: { pillars: DealPillars | null }) {
  if (!pillars) {
    return (
      <div className="card p-4 md:p-5 mb-4 md:mb-5 w-full">
        <h2 className="section-label mb-1">What We Know So Far</h2>
        <p className="text-textMuted text-xs">
          Pillar tracking will appear after this deal's next call review.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4 md:p-5 mb-4 md:mb-5 w-full">
      <h2 className="section-label mb-2">What We Know So Far</h2>
      <div>
        {PILLAR_ORDER.map(key => (
          <PillarBar key={key} label={PILLAR_LABELS[key]} pillar={pillars[key]} />
        ))}
      </div>
    </div>
  );
}

// --- Risk Evolution: a real timeline, not repeated card blocks --------
// One row per call. Calls after the first use their real
// what_changed_since_last_call payload (a true diff against the prior
// call). The first call has no prior state to diff against -- call-review
// deliberately omits that field on call #1, so instead of hiding Risk
// Evolution entirely until call #2, we synthesize a single "first read"
// entry from that call's own highest_priority_risk and what_youre_missing.
// It's framed as a first read, not a change, since there's nothing yet to
// compare against.

type EvolutionEntry = {
  call: Conversation;
  resolved: string[];
  persists: string[];
  newRisks: string[];
  isFirstRead: boolean;
};

function buildEvolution(calls: Conversation[]): EvolutionEntry[] {
  return calls
    .map((call, i) => {
      const changed = call.analysis_json?.what_changed_since_last_call;

      if (changed) {
        const hasContent = changed.resolved.length || changed.persists.length || changed.new_risks.length;
        if (!hasContent) return null;
        return {
          call,
          resolved: changed.resolved,
          persists: changed.persists,
          newRisks: changed.new_risks,
          isFirstRead: false,
        };
      }

      // No diff payload -- only synthesize a first-read entry for the
      // actual first call (i === 0). A later call missing this field is
      // an upstream data gap, not a first call, so it's skipped rather
      // than mislabeled.
      if (i !== 0) return null;

      const risk = call.analysis_json?.deal?.highest_priority_risk?.risk;
      const gaps = (call.analysis_json?.deal?.what_youre_missing ?? [])
        .map((m: any) => m?.gap)
        .filter(Boolean);

      if (!risk && gaps.length === 0) return null;

      return {
        call,
        resolved: [],
        persists: [risk, ...gaps].filter(Boolean),
        newRisks: [],
        isFirstRead: true,
      };
    })
    .filter((e): e is EvolutionEntry => e !== null)
    .reverse(); // newest first
}

function evolutionTrend(entry: EvolutionEntry): { icon: React.ReactNode; color: string; label: string } {
  if (entry.isFirstRead) {
    return { icon: <Minus className="w-3.5 h-3.5" />, color: '#8B93A7', label: 'First read' };
  }
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
                <Clock className="w-3 h-3" /> {entry.isFirstRead ? 'What we found' : 'Still open'}
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
      <p className="text-textMuted text-xs py-2">
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

function StakeholdersPanel({ stakeholders }: { stakeholders: Stakeholder[] }) {
  if (stakeholders.length === 0) {
    return (
      <p className="text-textMuted text-xs py-2">
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

// Action Plan / Risk Evolution / Stakeholders share one full-width card
// with a pill-style tab switcher instead of three stacked cards with
// duplicate chrome. One header, one border, one visual unit -- the reader
// picks which lens they want instead of scanning three near-identical
// boxes. Action Plan groups What's Still Missing, Next Recommended Action,
// and Manager Note together since they're causally linked: the gap, the
// move that closes it, and any human override on that move.
type DealReviewTab = 'action_plan' | 'evolution' | 'stakeholders';

function ActionPlanPanel({ dealState }: { dealState: DealState }) {
  const missing = dealState.what_youre_missing ?? [];
  const hasMissing = missing.length > 0;
  const hasFollowUp = !!dealState.key_follow_up_message;
  const hasNote = !!dealState.manager_note;

  if (!hasMissing && !hasFollowUp && !hasNote) {
    return <p className="text-textMuted text-xs py-2">Nothing outstanding for this deal right now.</p>;
  }

  return (
    <div className="space-y-4">
      {hasMissing && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">What's Still Missing</h3>
          <div className="space-y-3">
            {missing.map((item, i) => (
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

      {hasFollowUp && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">Next Recommended Action</h3>
          </div>
          <p className="text-textPrimary text-sm leading-relaxed">{dealState.key_follow_up_message}</p>
        </div>
      )}

      {hasNote && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-surfaceHigh border border-border">
          <ArrowRight className="w-3.5 h-3.5 text-textMuted flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-textMuted font-semibold mb-0.5">Manager Note</p>
            <p className="text-textSecondary text-xs leading-relaxed">{dealState.manager_note}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DealReviewTabBar({
  calls, stakeholders, activeTab, onTabChange,
}: {
  calls: Conversation[];
  stakeholders: Stakeholder[];
  activeTab: DealReviewTab;
  onTabChange: (tab: DealReviewTab) => void;
}) {
  const evolutionCount = buildEvolution(calls).length;

  const TABS: { key: DealReviewTab; label: string; count: number }[] = [
    { key: 'action_plan', label: 'Action Plan', count: 0 },
    { key: 'evolution', label: 'Risk Evolution', count: evolutionCount },
    { key: 'stakeholders', label: 'Stakeholders', count: stakeholders.length },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            'text-center px-4 py-2 rounded-full text-xs font-semibold transition-colors border',
            activeTab === tab.key
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-transparent text-textMuted border-border hover:text-textSecondary hover:border-textMuted/40'
          )}
        >
          {tab.label}
          {tab.count > 0 && <span className="ml-1 opacity-60">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

function DealReviewTabPanel({
  dealState, calls, stakeholders, activeTab,
}: {
  dealState: DealState;
  calls: Conversation[];
  stakeholders: Stakeholder[];
  activeTab: DealReviewTab;
}) {
  return (
    <div className="card p-4 md:p-5 w-full">
      {activeTab === 'action_plan' && <ActionPlanPanel dealState={dealState} />}
      {activeTab === 'evolution' && <RiskEvolutionPanel calls={calls} />}
      {activeTab === 'stakeholders' && <StakeholdersPanel stakeholders={stakeholders} />}
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

export function DealReview() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [nextMeeting, setNextMeeting] = useState<{ start_time: string; title: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewTab, setReviewTab] = useState<DealReviewTab>('action_plan');

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
          .eq('deal_id', dealId).eq('status', 'assigned').is('cancelled_at', null)
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
          action={<Button onClick={() => navigate('/app/new', { state: { existingDealId: dealId } })}>Add a Call</Button>}
        />
      </div>
    );
  }

  const lastContact = calls[calls.length - 1]?.created_at;
  const healthColor = healthScoreColor(dealState.deal_health_score ?? 0);
  const activity = buildActivity(calls, stakeholders);

  return (
    <div className="animate-fade-in w-full">
      <div className="-mx-4 md:hidden">
        <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
      </div>

      {/* ---- Header block: identity + status. Deliberately separate from
          the metrics strip below so the page reads top-down as a report:
          who is this deal, what's its status, then the numbers, then the
          answer to "what's most important right now." */}
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
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>

        <div className="flex md:hidden items-center justify-between">
          <p className="text-textSecondary text-sm">{deal.company_name}</p>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border"
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>
      </div>

      {/* ---- Metrics strip: Health Score gets a dedicated, larger slot on
          the left since it's the single number that summarizes the whole
          deal; the remaining four facts sit in an even row beside it.
          One card, one border -- not five competing columns. */}
      <div className="card p-4 md:p-5 mb-4 md:mb-5 w-full">
        <div className="grid grid-cols-[auto_1fr] gap-4 md:gap-6 items-center">
          <div className="flex items-center gap-3 pr-4 md:pr-6 border-r border-border">
            <div className="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0">
              <svg viewBox="0 0 64 64" className="w-14 h-14 md:w-16 md:h-16 -rotate-90">
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
            <div className="hidden sm:block">
              <p className="text-textPrimary text-xs font-semibold">Health Score</p>
              <p className="text-textMuted text-xs mt-0.5">out of 100</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <div>
              <p className="text-textPrimary text-sm font-semibold truncate">{formatValue(deal.deal_value)}</p>
              <p className="text-textMuted text-xs mt-0.5">Deal Value</p>
            </div>
            <div>
              <p className="text-textPrimary text-sm font-semibold truncate">{deal.deal_stage}</p>
              <p className="text-textMuted text-xs mt-0.5">Deal Stage</p>
            </div>
            <div>
              <p className="text-textPrimary text-sm font-semibold truncate">
                {lastContact ? formatDate(lastContact) : '—'}
              </p>
              <p className="text-textMuted text-xs mt-0.5">Last Contact</p>
            </div>
            <div>
              <p className="text-textPrimary text-sm font-semibold truncate">
                {nextMeeting ? formatDate(nextMeeting.start_time) : '—'}
              </p>
              <p className="text-textMuted text-xs mt-0.5">Next Meeting</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Highest Priority Risk: the hero card. This is the one
          question the product exists to answer, so it's the only card
          with a filled (not just outlined) accent treatment, sits first,
          and is never toggled away. Everything else is secondary to it. */}
      {dealState.highest_priority_risk_full?.risk && (
        <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 md:p-6 mb-4 md:mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">Highest Priority Risk</h2>
          </div>
          <p className="text-textPrimary text-base font-semibold mb-3 leading-snug">
            {dealState.highest_priority_risk_full.risk}
          </p>
          {dealState.highest_priority_risk_full.why_it_matters && (
            <div className="bg-bg/40 border border-red-400/15 rounded-lg p-3">
              <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
              <p className="text-textSecondary text-xs leading-relaxed">
                {dealState.highest_priority_risk_full.why_it_matters}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- What We Know So Far: five-pillar qualification strip.
          Sits between the hero risk card and the tab group -- ambient
          state like the health score, not a drill-down, so it's never
          hidden behind a tab. */}
      <PillarStrip pillars={dealState.pillars} />

      {/* ---- Tab group: Action Plan (default), Risk Evolution,
          Stakeholders. Pill buttons sit outside and above the content
          card, sized to their own labels rather than stretched full
          width. Timeline has been removed -- Deal Activity below already
          covers the chronological read. */}
      <div className="mb-4 md:mb-5 w-full">
        <div className="mb-3">
          <DealReviewTabBar
            calls={calls}
            stakeholders={stakeholders}
            activeTab={reviewTab}
            onTabChange={setReviewTab}
          />
        </div>
        <DealReviewTabPanel
          dealState={dealState}
          calls={calls}
          stakeholders={stakeholders}
          activeTab={reviewTab}
        />
      </div>

      {/* ---- Deal Activity: chronological read, always at the bottom. */}
      <DealActivityFeed activity={activity} dealId={dealId} navigate={navigate} />
    </div>
  );
}