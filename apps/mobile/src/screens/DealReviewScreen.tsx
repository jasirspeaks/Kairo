import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  getDealLongitudinalHistory,
  useAuth,
  useSubscription,
  checkCalendarConnected,
} from '@kairo/api';
import {
  getStatusColor,
  getHealthScoreColor,
  formatDealValue,
  PILLAR_ORDER,
  PILLAR_LABELS,
  getPillarBarColor,
  buildActivityTimeline,
  type Deal,
  type DealState,
  type Conversation,
  type Stakeholder,
  type DealPillars,
  type PillarKey,
  type DealRisk,
  type DealLongitudinalHistory,
} from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';
import { EvidenceInspectorSheet } from '../components/evidence/EvidenceInspectorSheet';
import { ScheduleMeetingSheet } from '../components/ui/ScheduleMeetingSheet';

type DealReviewTab = 'action_plan' | 'evolution' | 'stakeholders';

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
        const hasContent =
          changed.resolved.length || changed.persists.length || changed.new_risks.length;
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
    .reverse();
}

export function DealReviewScreen({ dealId }: { dealId?: string }) {
  const { goBack, navigate } = useNavigation();
  const { user } = useAuth();
  const { canWrite } = useSubscription(user?.id);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [history, setHistory] = useState<DealLongitudinalHistory | null>(null);
  const [nextMeetingTime, setNextMeetingTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DealReviewTab>('action_plan');
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);

  // Evidence Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectPillar, setInspectPillar] = useState<PillarKey | null>(null);
  const [inspectRisk, setInspectRisk] = useState<DealRisk | null>(null);
  const [inspectTitle, setInspectTitle] = useState<string | undefined>(undefined);

  async function handleOpenScheduleSheet() {
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to schedule meetings.'
      );
      return;
    }
    if (!user) return;
    const isConn = await checkCalendarConnected(user.id);
    if (!isConn) {
      Alert.alert(
        'Calendar Not Connected',
        'Please connect Google Calendar in Settings to schedule meetings.'
      );
      return;
    }
    setShowScheduleSheet(true);
  }

  useEffect(() => {
    if (!dealId) return;
    loadHistory();
  }, [dealId]);

  const loadHistory = async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const hist = await getDealLongitudinalHistory(dealId);
      setDeal(hist.deal);
      setDealState(hist.state);
      setCalls(hist.conversations || []);
      setStakeholders(hist.stakeholders || []);
      setHistory(hist);

      const now = new Date();
      const upcoming = (hist.meetings || []).find(
        (m) =>
          !m.cancelled_at &&
          (m.status === 'assigned' || m.status === 'scheduled') &&
          m.start_time &&
          new Date(m.start_time) >= now
      );
      setNextMeetingTime(upcoming?.start_time || null);
    } catch (err) {
      console.error('Failed to load deal history:', err);
    } finally {
      setLoading(false);
    }
  };

  const evolution = useMemo(() => buildEvolution(calls), [calls]);
  const activity = useMemo(
    () => buildActivityTimeline(calls, stakeholders, history?.transitions || []),
    [calls, stakeholders, history]
  );

  const handleInspectPillar = (pillarKey: PillarKey) => {
    setInspectPillar(pillarKey);
    setInspectRisk(null);
    setInspectTitle(PILLAR_LABELS[pillarKey]);
    setInspectorOpen(true);
  };

  const handleInspectRisk = (r: DealRisk) => {
    setInspectRisk(r);
    setInspectPillar(null);
    setInspectTitle(r.title);
    setInspectorOpen(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.container}>
        <TopBar title="Deal Review" onBack={goBack} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Deal not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>Back to Deals</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const effectiveState: DealState = dealState || {
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
    manager_note: 'Awaiting first call evidence for qualification.',
    supporting_evidence: null,
    last_review_summary: null,
    pillars: null,
    updated_at: deal.updated_at,
  };

  const status = effectiveState.current_status || 'Unknown';
  const statusColor = getStatusColor(status);
  const healthScore = effectiveState.deal_health_score ?? 0;
  const healthColor = getHealthScoreColor(healthScore);
  const lastContact = calls[calls.length - 1]?.created_at;

  const pillars: DealPillars | null = effectiveState.pillars;
  const countForPillar = (k: PillarKey) =>
    (history?.evidence || []).filter((e) => e.pillar_key === k).length;

  const durableRisks = history?.risks || [];
  const activeRisks = durableRisks.filter((r) => r.status === 'active');
  const resolvedRisks = durableRisks.filter((r) => r.status === 'resolved');

  return (
    <View style={styles.container}>
      <TopBar title={deal.deal_name} onBack={goBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Deal Identity Row with Schedule Meeting button */}
        <View style={styles.identityRow}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>🏢 {deal.company_name}</Text>
          </View>
          <View style={styles.identityActions}>
            <TouchableOpacity
              style={styles.scheduleBtn}
              onPress={handleOpenScheduleSheet}
              activeOpacity={0.7}
            >
              <Text style={styles.scheduleBtnText}>📅 Schedule</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: `${statusColor}1A`, borderColor: `${statusColor}4D` },
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
            </View>
          </View>
        </View>

        {/* Metrics Card: Health Score + Facts */}
        <View style={styles.metricsCard}>
          <View style={styles.healthScoreContainer}>
            <View style={[styles.healthCircle, { borderColor: healthColor }]}>
              <Text style={[styles.healthScoreValue, { color: healthColor }]}>
                {healthScore}
              </Text>
            </View>
            <Text style={styles.healthScoreLabel}>Health Score</Text>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{formatDealValue(deal.deal_value)}</Text>
              <Text style={styles.metricLabel}>Deal Value</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{deal.deal_stage}</Text>
              <Text style={styles.metricLabel}>Deal Stage</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {lastContact
                  ? new Date(lastContact).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </Text>
              <Text style={styles.metricLabel}>Last Contact</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {nextMeetingTime
                  ? new Date(nextMeetingTime).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </Text>
              <Text style={styles.metricLabel}>Next Meeting</Text>
            </View>
          </View>
        </View>

        {/* Awaiting Call Evidence Banner when no calls have been reviewed yet */}
        {calls.length === 0 && (
          <View style={styles.awaitingBanner}>
            <View style={styles.awaitingLeft}>
              <Text style={styles.awaitingTitle}>Awaiting Call Evidence</Text>
              <Text style={styles.awaitingSubtitle}>
                Add or record a call transcript to start tracking qualification pillars and deal risks.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.awaitingBtn}
              onPress={() => navigate('new_deal', { existingDealId: deal.id })}
              activeOpacity={0.8}
            >
              <Text style={styles.awaitingBtnText}>+ Add Call Transcript</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Highest Priority Risk Hero */}
        {effectiveState.highest_priority_risk_full?.risk && (
          <View style={styles.heroRiskCard}>
            <View style={styles.heroRiskHeader}>
              <Text style={styles.heroRiskTag}>HIGHEST PRIORITY RISK</Text>
              <TouchableOpacity
                style={styles.inspectEvidenceBtn}
                onPress={() => {
                  const heroRiskText = effectiveState.highest_priority_risk_full!.risk;
                  const matchingRisk: DealRisk = durableRisks.find(
                    (r) => r.title.toLowerCase() === heroRiskText.toLowerCase()
                  ) || {
                    id: 'hero-risk',
                    deal_id: deal.id,
                    title: heroRiskText,
                    why_it_matters: effectiveState.highest_priority_risk_full!.why_it_matters,
                    status: 'active',
                    severity: 'critical',
                    first_identified_call_id: null,
                    resolved_call_id: null,
                    consecutive_unresolved_calls: 1,
                    created_at: deal.created_at,
                    updated_at: deal.updated_at,
                  };
                  handleInspectRisk(matchingRisk);
                }}
              >
                <Text style={styles.inspectEvidenceBtnText}>Quotes</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroRiskTitle}>
              {effectiveState.highest_priority_risk_full.risk}
            </Text>
            {effectiveState.highest_priority_risk_full.why_it_matters && (
              <Text style={styles.heroRiskWhy}>
                {effectiveState.highest_priority_risk_full.why_it_matters}
              </Text>
            )}
          </View>
        )}

        {/* Qualification Pillars Strip */}
        <View style={styles.pillarsCard}>
          <Text style={styles.sectionLabel}>WHAT WE KNOW SO FAR</Text>
          {pillars ? (
            PILLAR_ORDER.map((key) => {
              const pillar = pillars[key];
              const conf = pillar?.confidence ?? 0;
              const barColor = getPillarBarColor(conf);
              const quotesCount = countForPillar(key);

              return (
                <View key={key} style={styles.pillarRow}>
                  <View style={styles.pillarHeader}>
                    <Text style={styles.pillarName}>{PILLAR_LABELS[key]}</Text>
                    <TouchableOpacity
                      style={styles.quotePill}
                      onPress={() => handleInspectPillar(key)}
                    >
                      <Text style={styles.quotePillText}>
                        Quotes{quotesCount > 0 ? ` (${quotesCount})` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pillarTrack}>
                    <View
                      style={[
                        styles.pillarFill,
                        { width: `${conf}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  {pillar?.evidence ? (
                    <Text style={styles.pillarEvidence}>{pillar.evidence}</Text>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyPillarsText}>
              Pillar tracking will appear after this deal's next call review.
            </Text>
          )}
        </View>

        {/* Tabbed Section: Action Plan / Risk Evolution / Stakeholders */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'action_plan' && styles.tabButtonActive]}
            onPress={() => setActiveTab('action_plan')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'action_plan' && styles.tabButtonTextActive,
              ]}
            >
              Action Plan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'evolution' && styles.tabButtonActive]}
            onPress={() => setActiveTab('evolution')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'evolution' && styles.tabButtonTextActive,
              ]}
            >
              Risk Evolution {evolution.length > 0 ? `(${evolution.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'stakeholders' && styles.tabButtonActive]}
            onPress={() => setActiveTab('stakeholders')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'stakeholders' && styles.tabButtonTextActive,
              ]}
            >
              Stakeholders ({stakeholders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Active Tab Panel */}
        <View style={styles.tabPanel}>
          {activeTab === 'action_plan' && (
            <View style={styles.actionPlanContainer}>
              {effectiveState.what_youre_missing &&
                effectiveState.what_youre_missing.length > 0 && (
                  <View style={styles.missingSection}>
                    <Text style={styles.missingTitle}>WHAT'S STILL MISSING</Text>
                    {effectiveState.what_youre_missing.map((item, idx) => (
                      <View key={idx} style={styles.missingItem}>
                        <Text style={styles.missingGap}>{item.gap}</Text>
                        <Text style={styles.missingQuestion}>
                          Ask: "{item.question_to_answer}"
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

              {effectiveState.key_follow_up_message && (
                <View style={styles.followUpCard}>
                  <Text style={styles.followUpTag}>NEXT RECOMMENDED ACTION</Text>
                  <Text style={styles.followUpText}>
                    {effectiveState.key_follow_up_message}
                  </Text>
                </View>
              )}

              {effectiveState.manager_note && (
                <View style={styles.managerNoteCard}>
                  <Text style={styles.managerNoteTag}>Manager Note</Text>
                  <Text style={styles.managerNoteText}>
                    {effectiveState.manager_note}
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'evolution' && (
            <View style={styles.evolutionContainer}>
              {/* Durable Risk Ledger */}
              <Text style={styles.sectionLabel}>DURABLE RISK LEDGER</Text>
              {durableRisks.length === 0 ? (
                <Text style={styles.emptyText}>No durable risks identified yet.</Text>
              ) : (
                <View style={styles.risksList}>
                  {activeRisks.map((r) => (
                    <View key={r.id} style={styles.riskRow}>
                      <View style={styles.riskRowHeader}>
                        <View style={styles.activeRiskTag}>
                          <Text style={styles.activeRiskTagText}>Active</Text>
                        </View>
                        <Text style={styles.riskRowTitle}>{r.title}</Text>
                        <TouchableOpacity
                          style={styles.quotePill}
                          onPress={() => handleInspectRisk(r)}
                        >
                          <Text style={styles.quotePillText}>Evidence</Text>
                        </TouchableOpacity>
                      </View>
                      {r.why_it_matters && (
                        <Text style={styles.riskRowWhy}>{r.why_it_matters}</Text>
                      )}
                    </View>
                  ))}

                  {resolvedRisks.map((r) => (
                    <View key={r.id} style={[styles.riskRow, styles.resolvedRiskRow]}>
                      <Text style={styles.resolvedRiskTitle}>{r.title}</Text>
                      <View style={styles.resolvedRiskTag}>
                        <Text style={styles.resolvedRiskTagText}>Resolved</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Call-by-call evolution diff */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                CALL-BY-CALL EVOLUTION
              </Text>
              {evolution.length === 0 ? (
                <Text style={styles.emptyText}>
                  Risk evolution appears once this deal has more than one call.
                </Text>
              ) : (
                <View style={styles.evolutionList}>
                  {evolution.map((e, idx) => (
                    <View key={e.call.id || idx} style={styles.evolutionCard}>
                      <View style={styles.evolutionHeader}>
                        <Text style={styles.evolutionStage}>
                          {e.call.deal_stage || 'Call'} ·{' '}
                          {new Date(e.call.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <View style={styles.evolutionTagsRow}>
                          {e.resolved.length > 0 && (
                            <View style={styles.resolvedTag}>
                              <Text style={styles.resolvedTagText}>
                                {e.resolved.length} resolved
                              </Text>
                            </View>
                          )}
                          {e.newRisks.length > 0 && (
                            <View style={styles.newRiskTag}>
                              <Text style={styles.newRiskTagText}>
                                {e.newRisks.length} new
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {e.resolved.map((res, i) => (
                        <Text key={i} style={styles.evolutionResolvedItem}>
                          ✓ {res}
                        </Text>
                      ))}
                      {e.persists.map((per, i) => (
                        <Text key={i} style={styles.evolutionPersistsItem}>
                          • {per}
                        </Text>
                      ))}
                      {e.newRisks.map((nr, i) => (
                        <Text key={i} style={styles.evolutionNewRiskItem}>
                          ! {nr}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === 'stakeholders' && (
            <View style={styles.stakeholdersContainer}>
              {stakeholders.length === 0 ? (
                <Text style={styles.emptyText}>
                  No stakeholders recognized yet. They'll appear here as Kairo recognizes named people across calls.
                </Text>
              ) : (
                stakeholders.map((s) => (
                  <View key={s.id} style={styles.stakeholderCard}>
                    <View style={styles.stakeholderHeader}>
                      <Text style={styles.stakeholderName}>{s.name}</Text>
                      {s.sentiment && (
                        <View style={styles.sentimentPill}>
                          <Text style={styles.sentimentText}>{s.sentiment.toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    {s.role && <Text style={styles.stakeholderRole}>{s.role}</Text>}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Deal Activity Feed */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DEAL ACTIVITY</Text>
          <View style={styles.activityCard}>
            {activity.length === 0 ? (
              <Text style={styles.emptyText}>No call activity recorded yet.</Text>
            ) : (
              activity.map((item) => {
                if (item.kind === 'call') {
                  const callVerdict = item.call.analysis_json?.call?.verdict;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.activityRow}
                      onPress={() =>
                        navigate('call_review', {
                          dealId: deal.id,
                          callId: item.call.id,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <View style={styles.activityLeft}>
                        <Text style={styles.activityTitle}>
                          📞 Call reviewed · {item.call.deal_stage || 'Call'}
                        </Text>
                        {callVerdict && (
                          <Text style={styles.activityVerdict} numberOfLines={1}>
                            {callVerdict}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.activityDate}>
                        {new Date(item.at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <Text style={styles.arrowIcon}>›</Text>
                    </TouchableOpacity>
                  );
                }

                if (item.kind === 'stage_transition') {
                  return (
                    <View key={item.id} style={styles.activityRow}>
                      <View style={styles.activityLeft}>
                        <Text style={styles.activityTitle}>
                          📈 Stage updated ·{' '}
                          {item.transition.from_stage ? `${item.transition.from_stage} → ` : ''}
                          {item.transition.to_stage}
                        </Text>
                        {item.transition.transition_reason && (
                          <Text style={styles.activityVerdict} numberOfLines={1}>
                            {item.transition.transition_reason}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.activityDate}>
                        {new Date(item.at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  );
                }

                const s = item.stakeholder;
                return (
                  <View key={item.id} style={styles.activityRow}>
                    <View style={styles.activityLeft}>
                      <Text style={styles.activityTitle}>
                        👤 Stakeholder identified · {s.name}
                      </Text>
                      <Text style={styles.activityVerdict} numberOfLines={1}>
                        {s.role || 'Role unknown'}
                      </Text>
                    </View>
                    <Text style={styles.activityDate}>
                      {new Date(item.at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Evidence Inspector Sheet */}
      <EvidenceInspectorSheet
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title={inspectTitle}
        pillarKey={inspectPillar}
        risk={inspectRisk}
        evidence={history?.evidence || []}
      />

      {deal ? (
        <ScheduleMeetingSheet
          open={showScheduleSheet}
          onClose={() => setShowScheduleSheet(false)}
          dealId={deal.id}
          dealName={deal.deal_name}
          companyName={deal.company_name}
          onMeetingScheduled={loadHistory}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  companyInfo: {
    flex: 1,
    marginRight: 8,
  },
  companyName: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  identityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scheduleBtnText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  healthScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  healthCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  healthScoreValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  healthScoreLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
  },
  metricsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 14,
    gap: 10,
  },
  metricItem: {
    width: '45%',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  awaitingBanner: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'column',
    gap: 10,
  },
  awaitingLeft: {
    gap: 4,
  },
  awaitingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  awaitingSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  awaitingBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  awaitingBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  heroRiskCard: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  heroRiskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroRiskTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dangerText,
    letterSpacing: 0.5,
  },
  inspectEvidenceBtn: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inspectEvidenceBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dangerText,
  },
  heroRiskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  heroRiskWhy: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  pillarsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptyPillarsText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  pillarRow: {
    marginBottom: 12,
  },
  pillarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pillarName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  quotePill: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  quotePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  pillarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  pillarFill: {
    height: '100%',
    borderRadius: 3,
  },
  pillarEvidence: {
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceElevated,
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
    lineHeight: 15,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  actionPlanContainer: {
    gap: 12,
  },
  missingSection: {
    gap: 8,
  },
  missingTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warningText,
    letterSpacing: 0.5,
  },
  missingItem: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
  },
  missingGap: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  missingQuestion: {
    fontSize: 11,
    color: colors.primary,
  },
  followUpCard: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  followUpTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  followUpText: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 16,
  },
  managerNoteCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
  },
  managerNoteTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
  },
  managerNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  evolutionContainer: {
    gap: 8,
  },
  risksList: {
    gap: 8,
  },
  riskRow: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  riskRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 6,
  },
  activeRiskTag: {
    backgroundColor: colors.dangerBg,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  activeRiskTagText: {
    color: colors.dangerText,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  riskRowTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  riskRowWhy: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  resolvedRiskRow: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: 0.75,
  },
  resolvedRiskTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  resolvedRiskTag: {
    backgroundColor: colors.successBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resolvedRiskTagText: {
    fontSize: 9,
    color: colors.successText,
    fontWeight: '700',
  },
  evolutionList: {
    gap: 8,
  },
  evolutionCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  evolutionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  evolutionStage: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  evolutionTagsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  resolvedTag: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  resolvedTagText: {
    color: colors.successText,
    fontSize: 9,
    fontWeight: '700',
  },
  newRiskTag: {
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  newRiskTagText: {
    color: colors.dangerText,
    fontSize: 9,
    fontWeight: '700',
  },
  evolutionResolvedItem: {
    fontSize: 11,
    color: colors.successText,
    paddingLeft: 4,
  },
  evolutionPersistsItem: {
    fontSize: 11,
    color: colors.textSecondary,
    paddingLeft: 4,
  },
  evolutionNewRiskItem: {
    fontSize: 11,
    color: colors.dangerText,
    paddingLeft: 4,
  },
  stakeholdersContainer: {
    gap: 8,
  },
  stakeholderCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
  },
  stakeholderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  stakeholderName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sentimentPill: {
    backgroundColor: colors.primaryGlow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sentimentText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '700',
  },
  stakeholderRole: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 16,
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityLeft: {
    flex: 1,
    marginRight: 8,
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activityVerdict: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activityDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginRight: 6,
  },
  arrowIcon: {
    fontSize: 18,
    color: colors.textMuted,
  },
});
