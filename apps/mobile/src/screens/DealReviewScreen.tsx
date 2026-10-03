import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { getDealLongitudinalHistory } from '@kairo/api';
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

type DealReviewTab = 'action_plan' | 'evolution' | 'stakeholders';

export function DealReviewScreen({ dealId }: { dealId?: string }) {
  const { goBack, navigate } = useNavigation();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [history, setHistory] = useState<DealLongitudinalHistory | null>(null);
  const [nextMeetingTime, setNextMeetingTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DealReviewTab>('action_plan');

  // Evidence Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectPillar, setInspectPillar] = useState<PillarKey | null>(null);
  const [inspectRisk, setInspectRisk] = useState<DealRisk | null>(null);
  const [inspectTitle, setInspectTitle] = useState<string | undefined>(undefined);

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

  return (
    <View style={styles.container}>
      <TopBar title={deal.deal_name} onBack={goBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Deal Identity Row */}
        <View style={styles.identityRow}>
          <View>
            <Text style={styles.companyName}>{deal.company_name}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: `${statusColor}1A`, borderColor: `${statusColor}4D` },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
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

        {/* Highest Priority Risk Hero */}
        {effectiveState.highest_priority_risk_full?.risk && (
          <View style={styles.heroRiskCard}>
            <View style={styles.heroRiskHeader}>
              <Text style={styles.heroRiskTag}>HIGHEST PRIORITY RISK</Text>
              <TouchableOpacity
                style={styles.inspectEvidenceBtn}
                onPress={() => {
                  const heroRiskText = effectiveState.highest_priority_risk_full!.risk;
                  const matchingRisk: DealRisk = history?.risks?.find(
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
            <Text style={[styles.tabButtonText, activeTab === 'action_plan' && styles.tabButtonTextActive]}>
              Action Plan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'evolution' && styles.tabButtonActive]}
            onPress={() => setActiveTab('evolution')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'evolution' && styles.tabButtonTextActive]}>
              Risk Evolution
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'stakeholders' && styles.tabButtonActive]}
            onPress={() => setActiveTab('stakeholders')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'stakeholders' && styles.tabButtonTextActive]}>
              Stakeholders ({stakeholders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Active Tab Panel */}
        <View style={styles.tabPanel}>
          {activeTab === 'action_plan' && (
            <View style={styles.actionPlanContainer}>
              {effectiveState.what_youre_missing && effectiveState.what_youre_missing.length > 0 && (
                <View style={styles.missingSection}>
                  <Text style={styles.missingTitle}>WHAT'S STILL MISSING</Text>
                  {effectiveState.what_youre_missing.map((item, idx) => (
                    <View key={idx} style={styles.missingItem}>
                      <Text style={styles.missingGap}>{item.gap}</Text>
                      <Text style={styles.missingQuestion}>Ask: "{item.question_to_answer}"</Text>
                    </View>
                  ))}
                </View>
              )}

              {effectiveState.key_follow_up_message && (
                <View style={styles.followUpCard}>
                  <Text style={styles.followUpTag}>NEXT RECOMMENDED ACTION</Text>
                  <Text style={styles.followUpText}>{effectiveState.key_follow_up_message}</Text>
                </View>
              )}

              {effectiveState.manager_note && (
                <View style={styles.managerNoteCard}>
                  <Text style={styles.managerNoteTag}>Manager Note</Text>
                  <Text style={styles.managerNoteText}>{effectiveState.manager_note}</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'evolution' && (
            <View style={styles.evolutionContainer}>
              <Text style={styles.sectionLabel}>DURABLE RISK LEDGER</Text>
              {(history?.risks || []).length === 0 ? (
                <Text style={styles.emptyText}>No durable risks identified yet.</Text>
              ) : (
                (history?.risks || []).map((r) => (
                  <View key={r.id} style={styles.riskRow}>
                    <View style={styles.riskRowHeader}>
                      <Text style={styles.riskRowTitle}>{r.title}</Text>
                      <Text style={styles.riskRowStatus}>{r.status.toUpperCase()}</Text>
                    </View>
                    {r.why_it_matters && (
                      <Text style={styles.riskRowWhy}>{r.why_it_matters}</Text>
                    )}
                  </View>
                ))
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
                    >
                      <View style={styles.activityLeft}>
                        <Text style={styles.activityTitle}>
                          Call reviewed · {item.call.deal_stage || 'Call'}
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
                    <View key={item.id} style={styles.transitionRow}>
                      <Text style={styles.transitionText}>
                        Stage updated · {item.transition.to_stage}
                      </Text>
                      <Text style={styles.activityDate}>
                        {new Date(item.at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View key={item.id} style={styles.activityRow}>
                    <Text style={styles.activityTitle}>
                      Stakeholder identified · {item.stakeholder.name}
                    </Text>
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

      {/* Evidence Inspector Modal Sheet */}
      <EvidenceInspectorSheet
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        pillarKey={inspectPillar}
        risk={inspectRisk}
        title={inspectTitle}
        evidence={history?.evidence || []}
      />
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
    marginBottom: 14,
  },
  companyName: {
    fontSize: 14,
    color: colors.textSecondary,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 14,
  },
  healthScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 14,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  healthCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  healthScoreValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  healthScoreLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
  },
  metricsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    marginTop: 1,
  },
  heroRiskCard: {
    backgroundColor: '#FF667A0D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FF667A33',
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
    fontWeight: '800',
    color: colors.red,
    letterSpacing: 0.5,
  },
  inspectEvidenceBtn: {
    backgroundColor: '#FF667A1F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF667A33',
  },
  inspectEvidenceBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.red,
  },
  heroRiskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 4,
  },
  heroRiskWhy: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  pillarsCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
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
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quotePillText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '700',
  },
  pillarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
    marginBottom: 4,
  },
  pillarFill: {
    height: '100%',
    borderRadius: 3,
  },
  pillarEvidence: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  emptyPillarsText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: '#7042C522',
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabPanel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.amber,
    letterSpacing: 0.5,
  },
  missingItem: {
    backgroundColor: colors.surfaceHigh,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: '#7042C512',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7042C533',
  },
  followUpTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  followUpText: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  managerNoteCard: {
    backgroundColor: colors.surfaceHigh,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
    lineHeight: 16,
  },
  evolutionContainer: {
    gap: 10,
  },
  riskRow: {
    backgroundColor: colors.surfaceHigh,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  riskRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  riskRowTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  riskRowStatus: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.red,
  },
  riskRowWhy: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  stakeholdersContainer: {
    gap: 8,
  },
  stakeholderCard: {
    backgroundColor: colors.surfaceHigh,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stakeholderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stakeholderName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sentimentPill: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sentimentText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.emerald,
  },
  stakeholderRole: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: 14,
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  activityLeft: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  activityVerdict: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  transitionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transitionText: {
    fontSize: 12,
    color: colors.emerald,
    fontWeight: '600',
  },
  activityDate: {
    fontSize: 10,
    color: colors.textMuted,
  },
  arrowIcon: {
    fontSize: 16,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
