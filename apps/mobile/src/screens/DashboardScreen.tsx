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
import { useAuth, getDashboardDeals, getMeetings, syncGoogleCalendar, type DealWithState } from '@kairo/api';
import {
  formatDealValue,
  getStatusColor,
  type DealStatus,
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

export function DashboardScreen() {
  const { user, profile } = useAuth();
  const { navigate, switchTab } = useNavigation();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [dealsData, meetingsData] = await Promise.all([
        getDashboardDeals(user.id),
        getMeetings(user.id, { upcomingOnly: true, limit: 8 }),
      ]);
      setDeals(dealsData);
      setMeetings(meetingsData);
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

        {/* Upcoming Meetings Carousel */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📅</Text>
            <Text style={styles.sectionLabel}>UPCOMING MEETINGS</Text>
          </View>

          {meetings.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
            >
              {meetings.map((m) => (
                <View key={m.id} style={styles.meetingCard}>
                  <View style={styles.meetingTimeRow}>
                    <Text style={styles.meetingClockIcon}>🕒</Text>
                    <Text style={styles.meetingTime}>
                      {formatMeetingTime(m.start_time)}
                    </Text>
                  </View>
                  <Text style={styles.meetingTitle} numberOfLines={1}>
                    {m.title || m.deal_name || 'Scheduled call'}
                  </Text>
                  {m.deal_name && m.title && (
                    <Text style={styles.meetingDeal} numberOfLines={1}>
                      {m.deal_name}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyMeetings}>
              <View style={styles.emptyMeetingIconBadge}>
                <Text style={styles.emptyMeetingEmoji}>📅</Text>
              </View>
              <Text style={styles.emptyMeetingsText}>No Upcoming Meetings</Text>
            </View>
          )}
        </View>

        {/* 2x2 Metric Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Active Deals */}
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

          {/* Deals At Risk */}
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

          {/* Pipeline Value */}
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

          {/* Pipeline at Risk */}
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

        {/* Deals Requiring Attention List */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DEALS REQUIRING ATTENTION</Text>

          {priorityRanked.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyTitle}>No active deals</Text>
              <Text style={styles.emptyText}>
                Tap the + button below to add your first deal and paste a call transcript.
              </Text>
            </View>
          ) : (
            <View style={styles.dealRowsContainer}>
              {priorityRanked.map((deal) => {
                const currentStatus = deal.deal_state?.current_status || 'Unknown';
                const statusColor = getStatusColor(currentStatus);

                return (
                  <TouchableOpacity
                    key={deal.id}
                    style={styles.dealRow}
                    onPress={() => navigate('deal_review', { dealId: deal.id })}
                    activeOpacity={0.7}
                  >
                    {/* Left vertical risk strip */}
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
                      <Text style={styles.dealName} numberOfLines={1}>
                        {deal.deal_name}
                      </Text>
                      <Text style={styles.dealPreview} numberOfLines={1}>
                        {deal.deal_state?.highest_priority_risk || deal.company_name}
                      </Text>
                    </View>

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
  sectionIcon: {
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  carousel: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
  },
  meetingCard: {
    width: 190,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  meetingTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  meetingClockIcon: {
    fontSize: 11,
  },
  meetingTime: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  meetingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meetingDeal: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
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
  emptyMeetingsText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statCardDanger: {
    borderColor: 'rgba(255, 102, 122, 0.25)',
    backgroundColor: 'rgba(255, 102, 122, 0.05)',
  },
  statIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statIconBadgeDanger: {
    backgroundColor: colors.dangerBg,
  },
  statEmoji: {
    fontSize: 16,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statValueDanger: {
    color: colors.red,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  statLabelDanger: {
    color: colors.red,
  },
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
    paddingVertical: 12,
    paddingRight: 14,
    overflow: 'hidden',
    minHeight: 64,
  },
  riskBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
  },
  dealRowContent: {
    flex: 1,
    marginRight: 8,
  },
  dealName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dealPreview: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  arrowIcon: {
    fontSize: 18,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
