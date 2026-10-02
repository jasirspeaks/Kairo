import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Phone, Users, Clock, Target,
  ChevronRight, Building2, UserPlus, TrendingUp, TrendingDown,
  Minus, CheckCircle2, AlertCircle, ArrowRight, Quote, ShieldAlert
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle, getDealLongitudinalHistory } from '../../lib/kairo';
import {
  Deal,
  DealState,
  Conversation,
  Stakeholder,
  DealPillars,
  PillarState,
  PillarKey,
  DealEvidence,
  DealRisk,
  DealPillarHistoryItem,
  DealLongitudinalHistory,
  SENTIMENT_LABEL,
  SENTIMENT_COLOR,
  PILLAR_LABELS,
  PILLAR_ORDER,
  getPillarBarColor as pillarBarColor,
  getHealthScoreColor as healthScoreColor,
  formatDealValue as formatValue,
  buildActivityTimeline as buildActivity,
  type ActivityItem,
} from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { ScheduleMeetingButton } from '../../components/ui/ScheduleMeetingButton';
import { EvidenceInspector } from '../../components/evidence/EvidenceInspector';
import { formatDate, cn } from '../../lib/utils';

function PillarBar({
  pillarKey,
  label,
  pillar,
  evidenceCount = 0,
  onInspectEvidence,
}: {
  pillarKey: PillarKey;
  label: string;
  pillar: PillarState;
  evidenceCount?: number;
  onInspectEvidence?: (pillarKey: PillarKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const isNotYetRelevant = pillar.status === 'not_yet_relevant';
  const hasEvidence = !!pillar.evidence;

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => hasEvidence && setOpen(v => !v)}
          className={cn(
            'flex-1 text-left min-w-0',
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

        {onInspectEvidence && (
          <button
            onClick={() => onInspectEvidence(pillarKey)}
            className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-textMuted hover:text-primary px-2 py-1 rounded bg-surfaceHigh/60 hover:bg-primary/10 border border-border transition-colors ml-2"
            title="Inspect verbatim transcript quotes"
          >
            <Quote className="w-3 h-3 text-primary" />
            <span>Quotes{evidenceCount > 0 ? ` (${evidenceCount})` : ''}</span>
          </button>
        )}
      </div>

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

function PillarStrip({
  pillars,
  evidence = [],
  onInspectEvidence,
}: {
  pillars: DealPillars | null;
  evidence?: DealEvidence[];
  onInspectEvidence?: (pillarKey: PillarKey) => void;
}) {
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

  const countForPillar = (key: PillarKey) => evidence.filter(e => e.pillar_key === key).length;

  return (
    <div className="card p-4 md:p-5 mb-4 md:mb-5 w-full">
      <h2 className="section-label mb-2">What We Know So Far</h2>
      <div>
        {PILLAR_ORDER.map(key => (
          <PillarBar
            key={key}
            pillarKey={key}
            label={PILLAR_LABELS[key]}
            pillar={pillars[key]}
            evidenceCount={countForPillar(key)}
            onInspectEvidence={onInspectEvidence}
          />
        ))}
      </div>
    </div>
  );
}

// --- Risk Evolution: a real timeline + durable risk ledger --------
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

function RiskEvolutionPanel({
  evolution,
  durableRisks = [],
  onInspectRisk,
}: {
  evolution: EvolutionEntry[];
  durableRisks?: DealRisk[];
  onInspectRisk?: (risk: DealRisk) => void;
}) {
  const activeRisks = durableRisks.filter(r => r.status === 'active');
  const resolvedRisks = durableRisks.filter(r => r.status === 'resolved');

  return (
    <div className="space-y-6">
      {/* Durable Risk Ledger if tracked */}
      {durableRisks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-textMuted flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-primary" />
            Durable Risk Ledger
          </h3>

          <div className="grid grid-cols-1 gap-2.5">
            {activeRisks.map(risk => (
              <div
                key={risk.id}
                className="bg-surfaceHigh/60 border border-red-400/20 rounded-lg p-3.5 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
                      Active
                    </span>
                    <span className="text-xs font-semibold text-textPrimary">{risk.title}</span>
                  </div>
                  {risk.why_it_matters && (
                    <p className="text-xs text-textSecondary leading-relaxed">{risk.why_it_matters}</p>
                  )}
                </div>

                {onInspectRisk && (
                  <button
                    onClick={() => onInspectRisk(risk)}
                    className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-textMuted hover:text-primary px-2.5 py-1 rounded bg-surface border border-border transition-colors"
                  >
                    <Quote className="w-3 h-3 text-primary" />
                    <span>Evidence</span>
                  </button>
                )}
              </div>
            ))}

            {resolvedRisks.map(risk => (
              <div
                key={risk.id}
                className="bg-surfaceHigh/40 border border-border rounded-lg p-3 flex items-center justify-between gap-3 opacity-75"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs text-textSecondary line-through truncate">{risk.title}</span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 flex-shrink-0">
                  Resolved
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call-by-call timeline diff */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
          Call-by-Call Evolution Timeline
        </h3>
        {evolution.length === 0 ? (
          <p className="text-textMuted text-xs py-2">
            Risk evolution appears once this deal has more than one call.
          </p>
        ) : (
          <div className="space-y-2">
            {evolution.map((entry, i) => (
              <EvolutionRow key={entry.call.id} entry={entry} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </div>
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
  evolutionCount, stakeholders, activeTab, onTabChange,
}: {
  evolutionCount: number;
  stakeholders: Stakeholder[];
  activeTab: DealReviewTab;
  onTabChange: (tab: DealReviewTab) => void;
}) {
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
  dealState, evolution, stakeholders, activeTab, durableRisks, onInspectRisk,
}: {
  dealState: DealState;
  evolution: EvolutionEntry[];
  stakeholders: Stakeholder[];
  activeTab: DealReviewTab;
  durableRisks: DealRisk[];
  onInspectRisk: (risk: DealRisk) => void;
}) {
  return (
    <div className="card p-4 md:p-5 w-full">
      {activeTab === 'action_plan' && <ActionPlanPanel dealState={dealState} />}
      {activeTab === 'evolution' && (
        <RiskEvolutionPanel
          evolution={evolution}
          durableRisks={durableRisks}
          onInspectRisk={onInspectRisk}
        />
      )}
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

          if (item.kind === 'stage_transition') {
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3.5 bg-surfaceHigh/20">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-textPrimary text-xs font-medium truncate">
                      Stage updated · {item.transition.from_stage ? `${item.transition.from_stage} → ` : ''}{item.transition.to_stage}
                    </p>
                    <span className="text-textMuted text-xs flex-shrink-0">{formatDate(item.at)}</span>
                  </div>
                  {item.transition.transition_reason && (
                    <p className="text-textMuted text-xs truncate mt-0.5">
                      {item.transition.transition_reason}
                    </p>
                  )}
                </div>
              </div>
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
  const [history, setHistory] = useState<DealLongitudinalHistory | null>(null);
  const [nextMeeting, setNextMeeting] = useState<{ start_time: string; title: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewTab, setReviewTab] = useState<DealReviewTab>('action_plan');

  // Evidence Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectPillar, setInspectPillar] = useState<PillarKey | null>(null);
  const [inspectRisk, setInspectRisk] = useState<DealRisk | null>(null);
  const [inspectTitle, setInspectTitle] = useState<string | undefined>(undefined);

  const evolution = useMemo(() => buildEvolution(calls), [calls]);
  const activity = useMemo(() => buildActivity(calls, stakeholders, history?.transitions || []), [calls, stakeholders, history]);

  useEffect(() => {
    if (!dealId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function fetchData() {
    setLoading(true);

    const [{ data: dealData }, { data: stateData }, { data: callsData }, { data: stakeholderData }, { data: meetingData }, histData] =
      await Promise.all([
        supabase.from('deals').select('*').eq('id', dealId).single(),
        supabase.from('deal_state').select('*').eq('deal_id', dealId).maybeSingle(),
        supabase.from('conversations').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('stakeholders').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('scheduled_meetings').select('start_time, title')
          .eq('deal_id', dealId).eq('status', 'assigned').is('cancelled_at', null)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true }).limit(1).maybeSingle(),
        dealId ? getDealLongitudinalHistory(dealId).catch(() => null) : Promise.resolve(null),
      ]);

    setDeal(dealData);
    setDealState(stateData);
    setCalls(callsData || []);
    setStakeholders(stakeholderData || []);
    setNextMeeting(meetingData || null);
    setHistory(histData);
    setLoading(false);
  }

  function handleInspectPillar(pillarKey: PillarKey) {
    setInspectPillar(pillarKey);
    setInspectRisk(null);
    setInspectTitle(PILLAR_LABELS[pillarKey]);
    setInspectorOpen(true);
  }

  function handleInspectRisk(risk: DealRisk) {
    setInspectRisk(risk);
    setInspectPillar(null);
    setInspectTitle(risk.title);
    setInspectorOpen(true);
  }

  function handleInspectHeroRisk() {
    if (!effectiveDealState.highest_priority_risk_full) return;
    const heroRiskText = effectiveDealState.highest_priority_risk_full.risk;
    const matchingDurableRisk: DealRisk = history?.risks?.find(r => r.title.toLowerCase() === heroRiskText.toLowerCase()) || {
      id: 'hero-risk',
      deal_id: dealId || '',
      title: heroRiskText,
      why_it_matters: effectiveDealState.highest_priority_risk_full.why_it_matters,
      status: 'active',
      severity: 'critical',
      first_identified_call_id: null,
      resolved_call_id: null,
      consecutive_unresolved_calls: 1,
      created_at: deal?.created_at || new Date().toISOString(),
      updated_at: deal?.updated_at || new Date().toISOString(),
    };
    handleInspectRisk(matchingDurableRisk);
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

  const effectiveDealState: DealState = dealState || {
    id: `placeholder-${deal.id}`,
    deal_id: deal.id,
    user_id: deal.user_id,
    current_status: 'Unknown',
    confidence: 'Low',
    deal_health_score: 0,
    highest_priority_risk: null,
    highest_priority_risk_full: null,
    what_youre_missing: null,
    key_follow_up_message: null,
    manager_note: 'Awaiting first call evidence for deal qualification and risk analysis.',
    supporting_evidence: null,
    last_review_summary: null,
    pillars: null,
    updated_at: deal.updated_at,
  };

  const lastContact = calls[calls.length - 1]?.created_at;
  const healthColor = healthScoreColor(effectiveDealState.deal_health_score ?? 0);

  return (
    <div className="animate-fade-in w-full">
      <div className="-mx-4 md:hidden">
        <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
      </div>

      {/* Header block: identity + status */}
      <div className="mb-4 md:mb-5">
        <div className="hidden md:flex items-start justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-textPrimary mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {deal.company_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ScheduleMeetingButton
              dealId={deal.id}
              dealName={deal.deal_name}
              companyName={deal.company_name}
              onMeetingScheduled={fetchData}
            />
            <span
              className="text-sm font-bold px-3 py-1.5 rounded-full border flex-shrink-0"
              style={getStatusStyle(effectiveDealState.current_status || 'Unknown')}
            >
              {effectiveDealState.current_status || 'Unknown'}
            </span>
          </div>
        </div>

        <div className="flex md:hidden items-center justify-between">
          <p className="text-textSecondary text-sm">{deal.company_name}</p>
          <div className="flex items-center gap-2">
            <ScheduleMeetingButton
              dealId={deal.id}
              dealName={deal.deal_name}
              companyName={deal.company_name}
              onMeetingScheduled={fetchData}
            />
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full border"
              style={getStatusStyle(effectiveDealState.current_status || 'Unknown')}
            >
              {effectiveDealState.current_status || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics strip */}
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
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - (effectiveDealState.deal_health_score ?? 0) / 100)}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-textPrimary">{effectiveDealState.deal_health_score ?? '—'}</span>
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

      {/* Awaiting Evidence banner when no calls have been reviewed yet */}
      {calls.length === 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4 md:p-6 mb-4 md:mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary mt-0.5">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-textPrimary mb-0.5">Awaiting Call Evidence</h2>
              <p className="text-xs text-textSecondary leading-relaxed">
                Add or record a call transcript to start tracking qualification pillars and deal risks.
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/app/new', { state: { existingDealId: dealId } })}
            size="sm"
            className="flex-shrink-0"
          >
            Add Call Transcript
          </Button>
        </div>
      )}

      {/* Highest Priority Risk: hero card */}
      {effectiveDealState.highest_priority_risk_full?.risk && (
        <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 md:p-6 mb-4 md:mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">Highest Priority Risk</h2>
            </div>
            <button
              onClick={handleInspectHeroRisk}
              className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 px-2.5 py-1 rounded bg-red-400/10 border border-red-400/20 transition-colors"
            >
              <Quote className="w-3 h-3" />
              <span>Inspect Evidence</span>
            </button>
          </div>
          <p className="text-textPrimary text-base font-semibold mb-3 leading-snug">
            {effectiveDealState.highest_priority_risk_full.risk}
          </p>
          {effectiveDealState.highest_priority_risk_full.why_it_matters && (
            <div className="bg-bg/40 border border-red-400/15 rounded-lg p-3">
              <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
              <p className="text-textSecondary text-xs leading-relaxed">
                {effectiveDealState.highest_priority_risk_full.why_it_matters}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Qualification Pillar Strip */}
      <PillarStrip
        pillars={effectiveDealState.pillars}
        evidence={history?.evidence || []}
        onInspectEvidence={handleInspectPillar}
      />

      {/* Tab group: Action Plan, Risk Evolution, Stakeholders */}
      <div className="mb-4 md:mb-5 w-full">
        <div className="mb-3">
          <DealReviewTabBar
            evolutionCount={evolution.length}
            stakeholders={stakeholders}
            activeTab={reviewTab}
            onTabChange={setReviewTab}
          />
        </div>
        <DealReviewTabPanel
          dealState={effectiveDealState}
          evolution={evolution}
          stakeholders={stakeholders}
          activeTab={reviewTab}
          durableRisks={history?.risks || []}
          onInspectRisk={handleInspectRisk}
        />
      </div>

      {/* Deal Activity: chronological read */}
      <DealActivityFeed activity={activity} dealId={dealId} navigate={navigate} />

      {/* Evidence Inspector Drawer */}
      <EvidenceInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        dealId={dealId || ''}
        pillarKey={inspectPillar}
        risk={inspectRisk}
        title={inspectTitle}
        evidence={history?.evidence || []}
        pillarHistory={history?.pillarHistory || []}
      />
    </div>
  );
}