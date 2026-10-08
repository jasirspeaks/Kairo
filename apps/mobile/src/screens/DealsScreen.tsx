import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth, supabase } from '@kairo/api';
import {
  formatDealValue,
  getStatusColor,
  DEAL_STAGES,
  type Deal,
  type DealStage,
  type DealStatus,
} from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';

type TimelineFilter = 'all' | '7d' | '30d' | '90d';
type StatusFilter = 'active' | 'all' | DealStatus;

interface DealRowItem extends Deal {
  current_status: DealStatus | null;
  last_contact: string | null;
  next_meeting: string | null;
  has_active_analysis?: boolean;
  has_recent_review?: boolean;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DealsScreen() {
  const { user } = useAuth();
  const { navigate, routeParams } = useNavigation();
  const [deals, setDeals] = useState<DealRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    routeParams?.filter === 'at-risk' ? 'At Risk' : 'all'
  );
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (routeParams?.filter === 'at-risk') {
      setStatusFilter('At Risk');
      setShowFilters(true);
    }
  }, [routeParams?.filter]);

  const fetchDeals = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data: rawDeals } = await supabase
        .from('deals')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!rawDeals || rawDeals.length === 0) {
        setDeals([]);
        return;
      }

      const dealIds = rawDeals.map((d) => d.id);

      const [{ data: states }, { data: lastCalls }, { data: meetings }] = await Promise.all([
        supabase.from('deal_state').select('deal_id, current_status').in('deal_id', dealIds),
        supabase
          .from('conversations')
          .select('deal_id, created_at, status')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('meetings')
          .select('deal_id, start_time')
          .in('deal_id', dealIds)
          .eq('status', 'assigned')
          .is('cancelled_at', null)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true }),
      ]);

      const statusByDeal = new Map((states || []).map((s) => [s.deal_id, s.current_status]));
      const completedCalls = (lastCalls || []).filter((c) => c.status === 'complete');
      const activeCalls = (lastCalls || []).filter((c) => ['pending', 'processing', 'retry_pending'].includes(c.status));
      const activeDealIds = new Set(activeCalls.map((c) => c.deal_id));

      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentCalls = completedCalls.filter((c) => new Date(c.created_at).getTime() >= twoHoursAgo);
      const recentDealIds = new Set(recentCalls.map((c) => c.deal_id));

      const lastContactByDeal = new Map<string, string>();
      completedCalls.forEach((c) => {
        if (!lastContactByDeal.has(c.deal_id)) lastContactByDeal.set(c.deal_id, c.created_at);
      });
      const nextMeetingByDeal = new Map<string, string>();
      (meetings || []).forEach((m) => {
        if (!nextMeetingByDeal.has(m.deal_id)) nextMeetingByDeal.set(m.deal_id, m.start_time);
      });

      setDeals(
        rawDeals.map((d) => ({
          ...d,
          current_status: statusByDeal.get(d.id) || null,
          last_contact: lastContactByDeal.get(d.id) || null,
          next_meeting: nextMeetingByDeal.get(d.id) || null,
          has_active_analysis: activeDealIds.has(d.id),
          has_recent_review: recentDealIds.has(d.id) && !activeDealIds.has(d.id),
        }))
      );
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDeals();
    if (!user?.id) return;

    const channel = supabase
      .channel('mobile-deals-conversations-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
        () => {
          fetchDeals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDeals();
  };

  const filteredDeals = useMemo(() => {
    const now = Date.now();
    const timelineMs: Record<TimelineFilter, number | null> = {
      all: null,
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
    };

    return deals.filter((d) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !d.deal_name.toLowerCase().includes(q) &&
          !d.company_name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      if (stageFilter !== 'all' && d.deal_stage !== stageFilter) return false;

      if (statusFilter === 'active') {
        if (d.status !== 'active') return false;
        if (d.current_status === 'Won' || d.current_status === 'Lost') return false;
      } else if (statusFilter !== 'all') {
        if ((d.current_status || 'Unknown') !== statusFilter) return false;
      }

      const window = timelineMs[timelineFilter];
      if (window !== null) {
        const reference = d.last_contact || d.updated_at;
        if (now - new Date(reference).getTime() > window) return false;
      }

      return true;
    });
  }, [deals, search, stageFilter, statusFilter, timelineFilter]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar
        title="Deals"
        action={
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => navigate('new_deal')}
            accessibilityLabel="New Deal"
          >
            <Text style={styles.headerAddBtnText}>+</Text>
          </TouchableOpacity>
        }
      />

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
        {/* Search & Filter Trigger */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search deals or companies..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <TouchableOpacity
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.filterIcon}>⚙️</Text>
            <Text
              style={[
                styles.filterToggleText,
                showFilters && styles.filterToggleTextActive,
              ]}
            >
              Filters
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Options Panel */}
        {showFilters && (
          <View style={styles.filtersCard}>
            {/* Timeline Filter */}
            <Text style={styles.filterSectionTitle}>TIMELINE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {(['all', '7d', '30d', '90d'] as TimelineFilter[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterPill, timelineFilter === t && styles.filterPillActive]}
                  onPress={() => setTimelineFilter(t)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      timelineFilter === t && styles.filterPillTextActive,
                    ]}
                  >
                    {t === 'all' ? 'All Time' : `Last ${t}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Stage Filter */}
            <Text style={[styles.filterSectionTitle, { marginTop: 12 }]}>DEAL STAGE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              <TouchableOpacity
                style={[styles.filterPill, stageFilter === 'all' && styles.filterPillActive]}
                onPress={() => setStageFilter('all')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    stageFilter === 'all' && styles.filterPillTextActive,
                  ]}
                >
                  All Stages
                </Text>
              </TouchableOpacity>
              {DEAL_STAGES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterPill, stageFilter === s && styles.filterPillActive]}
                  onPress={() => setStageFilter(s)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      stageFilter === s && styles.filterPillTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Status Filter */}
            <Text style={[styles.filterSectionTitle, { marginTop: 12 }]}>DEAL STATUS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {(
                [
                  'all',
                  'active',
                  'Healthy',
                  'Promising',
                  'At Risk',
                  'Critical',
                  'Stalled',
                  'Recovering',
                  'Won',
                  'Lost',
                  'Unknown',
                ] as StatusFilter[]
              ).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterPill, statusFilter === s && styles.filterPillActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      statusFilter === s && styles.filterPillTextActive,
                    ]}
                  >
                    {s === 'all' ? 'All' : s === 'active' ? 'Active Deals' : s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Deals List */}
        <View style={styles.list}>
          {filteredDeals.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyTitle}>
                {deals.length === 0 ? 'No deals yet' : 'No deals match your filters'}
              </Text>
              <Text style={styles.emptyText}>
                {deals.length === 0
                  ? 'Create your first deal to start tracking it with Kairo.'
                  : 'Try adjusting your search query or filters.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => navigate('new_deal')}
              >
                <Text style={styles.emptyAddBtnText}>+ Create New Deal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredDeals.map((deal) => {
              const status = deal.current_status || 'Unknown';
              const statusColor = getStatusColor(status);

              return (
                <TouchableOpacity
                  key={deal.id}
                  style={styles.dealCard}
                  onPress={() => navigate('deal_review', { dealId: deal.id })}
                  activeOpacity={0.7}
                >
                  {/* Top row: Deal Name + Value */}
                  <View style={styles.dealHeader}>
                    <View style={styles.dealNameContainer}>
                      <Text style={styles.dealName} numberOfLines={1}>
                        {deal.deal_name}
                      </Text>
                      {deal.has_active_analysis ? (
                        <View style={styles.analyzingBadge}>
                          <View style={styles.analyzingDot} />
                          <Text style={styles.analyzingText}>Analyzing</Text>
                        </View>
                      ) : deal.has_recent_review ? (
                        <View style={styles.reviewReadyBadge}>
                          <Text style={styles.reviewReadyText}>✦ Review ready</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.dealValue}>
                      {formatDealValue(deal.deal_value)}
                    </Text>
                  </View>

                  {/* Company Name */}
                  <Text style={styles.companyName} numberOfLines={1}>
                    {deal.company_name}
                  </Text>

                  {/* Badges and Dates row */}
                  <View style={styles.metaRow}>
                    <View style={styles.stagePill}>
                      <Text style={styles.stageText}>{deal.deal_stage}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: `${statusColor}1A`,
                          borderColor: `${statusColor}4D`,
                        },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {status}
                      </Text>
                    </View>

                    <View style={styles.datesContainer}>
                      {deal.last_contact && (
                        <Text style={styles.dateText}>
                          Last: {formatDate(deal.last_contact)}
                        </Text>
                      )}
                      {deal.next_meeting && (
                        <Text style={[styles.dateText, styles.nextMeetingDate]}>
                          Next: {formatDate(deal.next_meeting)}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.arrow}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })
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
  headerAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddBtnText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 12,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: colors.textPrimary,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  filterToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  filterIcon: {
    fontSize: 12,
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterToggleTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filtersCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pillScroll: {
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  dealCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dealName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: 8,
  },
  dealValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  companyName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stagePill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  datesContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  dateText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  nextMeetingDate: {
    color: colors.primary,
    fontWeight: '600',
  },
  arrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 4,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyEmoji: {
    fontSize: 32,
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
    lineHeight: 16,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dealNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  analyzingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  analyzingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FBBF24',
  },
  analyzingText: {
    color: '#FCD34D',
    fontSize: 10,
    fontWeight: '600',
  },
  reviewReadyBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reviewReadyText: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: '600',
  },
});
