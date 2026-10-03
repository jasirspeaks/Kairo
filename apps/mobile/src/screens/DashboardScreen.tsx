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
    <ScrollView
      style={styles.container}
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
        <Text style={styles.sectionLabel}>UPCOMING MEETINGS</Text>
        {meetings.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel}>
            {meetings.map((m) => (
              <View key={m.id} style={styles.meetingCard}>
                <Text style={styles.meetingTime}>
                  {m.start_time
                    ? new Date(m.start_time).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'Scheduled'}
                </Text>
                <Text style={styles.meetingTitle} numberOfLines={1}>
                  {m.title || m.deal_name || 'Sales Call'}
                </Text>
                {m.deal_name && (
                  <Text style={styles.meetingDeal} numberOfLines={1}>
                    {m.deal_name}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyMeetings}>
            <Text style={styles.emptyMeetingsText}>No Upcoming Meetings</Text>
          </View>
        )}
      </View>

      {/* 2x2 Metric Stats Grid */}
      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => switchTab('deals')}
        >
          <Text style={styles.statLabel}>ACTIVE DEALS</Text>
          <Text style={styles.statValue}>{deals.length}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statCard, atRisk.length > 0 && styles.statCardDanger]}
          onPress={() => switchTab('deals')}
        >
          <Text style={[styles.statLabel, atRisk.length > 0 && styles.statLabelDanger]}>
            DEALS AT RISK
          </Text>
          <Text style={[styles.statValue, atRisk.length > 0 && styles.statValueDanger]}>
            {atRisk.length}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => switchTab('deals')}
        >
          <Text style={styles.statLabel}>PIPELINE VALUE</Text>
          <Text style={styles.statValue}>{formatDealValue(pipelineValue)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statCard, pipelineAtRisk > 0 && styles.statCardDanger]}
          onPress={() => switchTab('deals')}
        >
          <Text style={[styles.statLabel, pipelineAtRisk > 0 && styles.statLabelDanger]}>
            PIPELINE AT RISK
          </Text>
          <Text style={[styles.statValue, pipelineAtRisk > 0 && styles.statValueDanger]}>
            {formatDealValue(pipelineAtRisk)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Deals Requiring Attention List */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DEALS REQUIRING ATTENTION</Text>

        {priorityRanked.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active deals</Text>
            <Text style={styles.emptyText}>
              Tap the + button below to add your first deal and review calls.
            </Text>
          </View>
        ) : (
          priorityRanked.map((deal) => {
            const currentStatus = deal.deal_state?.current_status || 'Unknown';
            const statusColor = getStatusColor(currentStatus);

            return (
              <TouchableOpacity
                key={deal.id}
                style={styles.dealRow}
                onPress={() => navigate('deal_review', { dealId: deal.id })}
              >
                {/* Risk color indicator strip */}
                <View
                  style={[
                    styles.riskDot,
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
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subGreeting: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  carousel: {
    flexDirection: 'row',
  },
  meetingCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    width: 170,
    marginRight: 10,
  },
  meetingTime: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  meetingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meetingDeal: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyMeetings: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyMeetingsText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  statCardDanger: {
    borderColor: '#FF667A33',
    backgroundColor: '#FF667A0A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statLabelDanger: {
    color: colors.red,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statValueDanger: {
    color: colors.red,
  },
  dealRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  riskDot: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  dealRowContent: {
    flex: 1,
  },
  dealName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dealPreview: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  arrowIcon: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 2,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
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
