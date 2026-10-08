import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {
  useAuth,
  getDashboardDeals,
  getMeetings,
  syncGoogleCalendar,
  checkCalendarConnected,
  type DealWithState,
} from '@kairo/api';
import {
  formatDealValue,
  getStatusColor,
  getHealthScoreColor,
  summarizePipelinePillars,
  PILLAR_ORDER,
  PILLAR_LABELS,
  type DealStatus,
  type DealPillars,
  type MeetingWithDeal,
} from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';

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

function MobileHealthBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <View style={styles.healthBadgeEmpty}>
        <Text style={styles.healthBadgeTextEmpty}>—</Text>
      </View>
    );
  }
  const color = getHealthScoreColor(score);
  return (
    <View
      style={[
        styles.healthBadge,
        {
          borderColor: `${color}4D`,
          backgroundColor: `${color}1A`,
        },
      ]}
    >
      <View style={[styles.healthDot, { backgroundColor: color }]} />
      <Text style={[styles.healthBadgeText, { color }]}>{score}</Text>
    </View>
  );
}

function MobilePillarDots({ pillars }: { pillars?: DealPillars | null }) {
  return (
    <View style={styles.pillarDotsRow}>
      {PILLAR_ORDER.map((key) => {
        const pillar = pillars?.[key];
        const status = pillar?.status;
        const color =
          status === 'confirmed'
            ? colors.emerald
            : status === 'partial'
            ? colors.amber
            : pillars
            ? colors.red
            : colors.border;
        return (
          <View
            key={key}
            style={[styles.pillarDot, { backgroundColor: color }]}
          />
        );
      })}
    </View>
  );
}

export function DashboardScreen() {
  const { user, profile } = useAuth();
  const { navigate, switchTab } = useNavigation();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithDeal[]>([]);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [dealsData, meetingsData, calConnected] = await Promise.all([
        getDashboardDeals(user.id),
        getMeetings(user.id, { upcomingOnly: true, limit: 8 }),
        checkCalendarConnected(user.id).catch(() => false),
      ]);
      setDeals(dealsData);
      setMeetings(meetingsData);
      setCalendarConnected(calConnected);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    syncGoogleCalendar().finally(fetchData);
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    syncGoogleCalendar().finally(fetchData);
  };

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
  const assignedDeal = nextMeeting?.deal_id
    ? deals.find((d) => d.id === nextMeeting.deal_id)
    : null;

  const pillarSummaries = summarizePipelinePillars(deals);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Kairo" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Greeting Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </Text>
          <Text style={styles.subGreeting}>
            {deals.length === 0
              ? 'No active deals yet. Tap + to add your first.'
              : "Here's how your pipeline's looking."}
          </Text>
        </View>

        {/* Upcoming Meeting / Next Call */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📅</Text>
            <Text style={styles.sectionLabel}>UPCOMING CALL</Text>
          </View>

          {nextMeeting ? (
            <View style={styles.upcomingWrapper}>
              {nextMeeting.deal_id && assignedDeal ? (
                <TouchableOpacity
                  style={styles.nextCallCard}
                  onPress={() => navigate('deal_review', { dealId: nextMeeting.deal_id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.nextCallHeader}>
                    <Text style={styles.nextCallTime}>
                      {formatMeetingTime(nextMeeting.start_time)}
                    </Text>
                    <Text style={styles.nextCallDealName} numberOfLines={1}>
                      {assignedDeal.deal_name}
                    </Text>
                    {assignedDeal.deal_state?.deal_health_score != null && (
                      <MobileHealthBadge score={assignedDeal.deal_state.deal_health_score} />
                    )}
                  </View>

                  <Text style={styles.nextCallTitle} numberOfLines={1}>
                    {nextMeeting.title || 'Scheduled call'}
                  </Text>

                  {assignedDeal.deal_state?.highest_priority_risk ? (
                    <Text style={styles.nextCallRisk} numberOfLines={2}>
                      <Text style={styles.nextCallRiskLabel}>Highest priority risk: </Text>
                      {assignedDeal.deal_state.highest_priority_risk}
                    </Text>
                  ) : assignedDeal.deal_state?.what_youre_missing?.[0]?.question_to_answer ? (
                    <Text style={styles.nextCallRisk} numberOfLines={2}>
                      <Text style={styles.nextCallRiskLabel}>Question to answer: </Text>
                      "{assignedDeal.deal_state.what_youre_missing[0].question_to_answer}"
                    </Text>
                  ) : !assignedDeal.deal_state ? (
                    <Text style={styles.nextCallMuted}>Awaiting first call review</Text>
                  ) : null}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.unassignedCard}
                  onPress={() => switchTab('inbox')}
                  activeOpacity={0.7}
                >
                  <View style={styles.nextCallHeader}>
                    <Text style={styles.unassignedTime}>
                      {formatMeetingTime(nextMeeting.start_time)}
                    </Text>
                    <View style={styles.unassignedBadge}>
                      <Text style={styles.unassignedBadgeText}>Unassigned</Text>
                    </View>
                  </View>
                  <Text style={styles.nextCallTitle} numberOfLines={1}>
                    {nextMeeting.title || 'Scheduled Meeting'}
                  </Text>
                  <Text style={styles.unassignedSubtext}>
                    This meeting is not linked to a deal yet. Tap to assign in Inbox ›
                  </Text>
                </TouchableOpacity>
              )}

              {/* Subsequent meetings scroll */}
              {meetings.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.secondaryMeetingsRow}
                >
                  {meetings.slice(1, 5).map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.secondaryMeetingChip}
                      onPress={() => m.deal_id && navigate('deal_review', { dealId: m.deal_id })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.secondaryMeetingTime}>
                        {formatMeetingTime(m.start_time)}
                      </Text>
                      <Text style={styles.secondaryMeetingTitle} numberOfLines={1}>
                        {m.deal_name || m.title || 'Call'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : calendarConnected === false ? (
            <TouchableOpacity
              style={styles.emptyMeetings}
              onPress={() => switchTab('settings')}
              activeOpacity={0.7}
            >
              <View style={styles.emptyMeetingIconBadge}>
                <Text style={styles.emptyMeetingEmoji}>📅</Text>
              </View>
              <View style={styles.emptyMeetingsTextWrap}>
                <Text style={styles.emptyMeetingsTitle}>Google Calendar not connected</Text>
                <Text style={styles.emptyMeetingsSub}>Connect in Settings to automatically sync meetings ›</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyMeetings}>
              <View style={styles.emptyMeetingIconBadge}>
                <Text style={styles.emptyMeetingEmoji}>📅</Text>
              </View>
              <Text style={styles.emptyMeetingsText}>No upcoming meetings scheduled</Text>
            </View>
          )}
        </View>

        {/* 2x2 Metric Stats Grid */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => switchTab('deals')}
            activeOpacity={0.7}
          >
            <View style={styles.statIconBadge}>
              <Text style={styles.statEmoji}>📈</Text>
            </View>
            <Text style={styles.statValue}>{deals.length}</Text>
            <Text style={styles.statLabel}>Active Deals</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, atRisk.length > 0 && styles.statCardDanger]}
            onPress={() => navigate('deals', { filter: 'at-risk' })}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statIconBadge,
                atRisk.length > 0 && styles.statIconBadgeDanger,
              ]}
            >
              <Text style={styles.statEmoji}>⚠️</Text>
            </View>
            <Text
              style={[
                styles.statValue,
                atRisk.length > 0 && styles.statValueDanger,
              ]}
            >
              {atRisk.length}
            </Text>
            <Text
              style={[
                styles.statLabel,
                atRisk.length > 0 && styles.statLabelDanger,
              ]}
            >
              Deals at Risk
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => switchTab('deals')}
            activeOpacity={0.7}
          >
            <View style={styles.statIconBadge}>
              <Text style={styles.statEmoji}>💼</Text>
            </View>
            <Text style={styles.statValue}>{formatDealValue(pipelineValue)}</Text>
            <Text style={styles.statLabel}>Pipeline Value</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, pipelineAtRisk > 0 && styles.statCardDanger]}
            onPress={() => navigate('deals', { filter: 'at-risk' })}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statIconBadge,
                pipelineAtRisk > 0 && styles.statIconBadgeDanger,
              ]}
            >
              <Text style={styles.statEmoji}>🛡️</Text>
            </View>
            <Text
              style={[
                styles.statValue,
                pipelineAtRisk > 0 && styles.statValueDanger,
              ]}
            >
              {formatDealValue(pipelineAtRisk)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                pipelineAtRisk > 0 && styles.statLabelDanger,
              ]}
            >
              Pipeline at Risk
            </Text>
          </TouchableOpacity>
        </View>

        {/* 5-Pillar Overview */}
        {deals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderBetween}>
              <Text style={styles.sectionLabel}>5-PILLAR OVERVIEW</Text>
              <Text style={styles.sectionSubMuted}>
                Across {deals.length} active {deals.length === 1 ? 'deal' : 'deals'}
              </Text>
            </View>

            <View style={styles.pillarsCard}>
              {pillarSummaries.map((summary, idx) => {
                const confirmedPct =
                  summary.totalDeals > 0
                    ? (summary.confirmedCount / summary.totalDeals) * 100
                    : 0;
                const partialPct =
                  summary.totalDeals > 0
                    ? (summary.partialCount / summary.totalDeals) * 100
                    : 0;
                const isLast = idx === pillarSummaries.length - 1;

                return (
                  <TouchableOpacity
                    key={summary.key}
                    style={[styles.pillarRow, !isLast && styles.pillarRowBorder]}
                    onPress={() => switchTab('deals')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pillarHeaderRow}>
                      <Text style={styles.pillarTitle}>{summary.label}</Text>
                      <Text style={styles.pillarRatio}>
                        {summary.confirmedCount} of {summary.totalDeals} confirmed
                      </Text>
                    </View>
                    <View style={styles.pillarProgressBar}>
                      <View
                        style={[
                          styles.pillarProgressConfirmed,
                          { width: `${confirmedPct}%` },
                        ]}
                      />
                      <View
                        style={[
                          styles.pillarProgressPartial,
                          { width: `${partialPct}%` },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Deals Requiring Attention */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderBetween}>
            <Text style={styles.sectionLabel}>DEALS REQUIRING ATTENTION</Text>
            {priorityRanked.length > 0 && (
              <Text style={styles.sectionSubMuted}>
                {priorityRanked.length} {priorityRanked.length === 1 ? 'deal' : 'deals'}
              </Text>
            )}
          </View>

          {priorityRanked.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyTitle}>All active deals are healthy or promising</Text>
              <Text style={styles.emptyText}>
                No critical risks or stalled deals detected.
              </Text>
            </View>
          ) : (
            <View style={styles.dealRowsContainer}>
              {priorityRanked.map((deal) => {
                const currentStatus = deal.deal_state?.current_status || 'Unknown';
                const statusColor = getStatusColor(currentStatus);
                const score = deal.deal_state?.deal_health_score;
                const isAwaitingFirstCall = !deal.deal_state;

                return (
                  <TouchableOpacity
                    key={deal.id}
                    style={styles.dealRow}
                    onPress={() => navigate('deal_review', { dealId: deal.id })}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.riskBar,
                        {
                          backgroundColor:
                            deal.risk_level === 'high'
                              ? colors.red
                              : deal.risk_level === 'medium'
                              ? colors.amber
                              : deal.risk_level === 'low'
                              ? colors.emerald
                              : colors.border,
                        },
                      ]}
                    />

                    <View style={styles.dealRowContent}>
                      <View style={styles.dealRowTop}>
                        <Text style={styles.dealName} numberOfLines={1}>
                          {deal.deal_name}
                        </Text>
                        {deal.company_name ? (
                          <Text style={styles.dealCompany} numberOfLines={1}>
                            ({deal.company_name})
                          </Text>
                        ) : null}
                      </View>

                      <Text style={styles.dealPreview} numberOfLines={1}>
                        {deal.deal_state?.highest_priority_risk ||
                          deal.deal_state?.what_youre_missing?.[0]?.gap ||
                          (isAwaitingFirstCall ? 'Awaiting first call' : deal.company_name || 'No risks recorded')}
                      </Text>

                      <View style={styles.dealSubRow}>
                        <MobilePillarDots pillars={deal.deal_state?.pillars} />
                      </View>
                    </View>

                    <View style={styles.dealRightMeta}>
                      <MobileHealthBadge score={score} />
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: `${statusColor}1A`,
                            borderColor: `${statusColor}4D`,
                          },
                        ]}
                      >
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {currentStatus}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.arrowIcon}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
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
  header: {
    marginBottom: 20,
    marginTop: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subGreeting: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionIcon: {
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  sectionSubMuted: {
    fontSize: 11,
    color: colors.textMuted,
  },

  /* Next Call Styles */
  upcomingWrapper: {
    gap: 8,
  },
  nextCallCard: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(112, 66, 197, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  nextCallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  nextCallTime: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  nextCallDealName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  nextCallTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  nextCallRisk: {
    fontSize: 12,
    color: colors.amber,
    marginTop: 2,
  },
  nextCallRiskLabel: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  nextCallMuted: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  unassignedCard: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(246, 178, 62, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  unassignedTime: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.amber,
  },
  unassignedBadge: {
    backgroundColor: 'rgba(246, 178, 62, 0.15)',
    borderColor: 'rgba(246, 178, 62, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  unassignedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.amber,
  },
  unassignedSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },

  secondaryMeetingsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  secondaryMeetingChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryMeetingTime: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  secondaryMeetingTitle: {
    fontSize: 11,
    color: colors.textPrimary,
    maxWidth: 120,
  },

  emptyMeetings: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  emptyMeetingIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMeetingEmoji: {
    fontSize: 16,
  },
  emptyMeetingsTextWrap: {
    flex: 1,
  },
  emptyMeetingsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyMeetingsSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyMeetingsText: {
    fontSize: 13,
    color: colors.textMuted,
  },

  /* Stats Grid */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statCardDanger: {
    borderColor: 'rgba(255, 102, 122, 0.25)',
  },
  statIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(112, 66, 197, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconBadgeDanger: {
    backgroundColor: 'rgba(255, 102, 122, 0.1)',
  },
  statEmoji: {
    fontSize: 15,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statValueDanger: {
    color: colors.red,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  statLabelDanger: {
    color: colors.red,
  },

  /* 5-Pillar Overview */
  pillarsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  pillarRow: {
    paddingVertical: 10,
  },
  pillarRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pillarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pillarTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pillarRatio: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillarProgressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  pillarProgressConfirmed: {
    height: '100%',
    backgroundColor: colors.emerald,
  },
  pillarProgressPartial: {
    height: '100%',
    backgroundColor: colors.amber,
  },

  /* Health & Pillar Dots */
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  healthBadgeEmpty: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  healthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  healthBadgeTextEmpty: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  healthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  pillarDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  pillarDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },

  /* Attention Deal Rows */
  dealRowsContainer: {
    gap: 8,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 12,
    overflow: 'hidden',
    minHeight: 64,
  },
  riskBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  dealRowContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dealRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dealName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  dealCompany: {
    fontSize: 11,
    color: colors.textMuted,
    flexShrink: 1,
  },
  dealPreview: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  dealSubRow: {
    marginTop: 2,
  },
  dealRightMeta: {
    alignItems: 'flex-end',
    gap: 4,
    marginRight: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  arrowIcon: {
    fontSize: 16,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
  },
  emptyEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
