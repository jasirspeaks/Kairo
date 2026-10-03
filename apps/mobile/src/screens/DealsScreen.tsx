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
import { useAuth, getDeals, getDealState } from '@kairo/api';
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

type TimelineFilter = 'all' | '7d' | '30d' | '90d';
type StatusFilter = 'active' | 'all' | DealStatus;

interface DealRowItem extends Deal {
  current_status: DealStatus | null;
}

export function DealsScreen() {
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const [deals, setDeals] = useState<DealRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const fetchDeals = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const rawDeals = await getDeals(user.id);
      const rowsWithState = await Promise.all(
        rawDeals.map(async (d) => {
          const state = await getDealState(d.id).catch(() => null);
          return {
            ...d,
            current_status: state?.current_status || null,
          };
        })
      );
      setDeals(rowsWithState);
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDeals();
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
        if (now - new Date(d.updated_at).getTime() > window) return false;
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Deals</Text>
          <Text style={styles.subtitle}>
            All deals, filterable by timeline, stage, and status.
          </Text>
        </View>
      </View>

      {/* Search & Filter Trigger */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search deals or companies..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          onPress={() => setShowFilters((v) => !v)}
        >
          <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
            Filters
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Options Panel */}
      {showFilters && (
        <View style={styles.filtersCard}>
          <Text style={styles.filterSectionTitle}>TIMELINE</Text>
          <View style={styles.pillRow}>
            {(['all', '7d', '30d', '90d'] as TimelineFilter[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.filterPill, timelineFilter === t && styles.filterPillActive]}
                onPress={() => setTimelineFilter(t)}
              >
                <Text style={[styles.filterPillText, timelineFilter === t && styles.filterPillTextActive]}>
                  {t === 'all' ? 'All Time' : `Last ${t}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterSectionTitle}>STATUS</Text>
          <View style={styles.pillRow}>
            {(['all', 'active', 'Healthy', 'At Risk', 'Critical', 'Stalled'] as StatusFilter[]).map(
              (s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterPill, statusFilter === s && styles.filterPillActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.filterPillText, statusFilter === s && styles.filterPillTextActive]}>
                    {s === 'all' ? 'All' : s}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      )}

      {/* Deals List */}
      <View style={styles.list}>
        {filteredDeals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {deals.length === 0 ? 'No deals yet' : 'No deals match your filters'}
            </Text>
            <Text style={styles.emptyText}>
              {deals.length === 0
                ? 'Create your first deal to start tracking it with Kairo.'
                : 'Try adjusting your search query or filters.'}
            </Text>
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
              >
                <View style={styles.dealHeader}>
                  <Text style={styles.dealName} numberOfLines={1}>
                    {deal.deal_name}
                  </Text>
                  <Text style={styles.dealValue}>{formatDealValue(deal.deal_value)}</Text>
                </View>

                <Text style={styles.companyName} numberOfLines={1}>
                  {deal.company_name}
                </Text>

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
                    <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </View>
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
    marginBottom: 16,
    marginTop: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 13,
  },
  filterToggle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  filterToggleActive: {
    backgroundColor: '#7042C51A',
    borderColor: colors.primary,
  },
  filterToggleText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterToggleTextActive: {
    color: colors.primary,
  },
  filtersCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  filterSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  filterPill: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: '#7042C522',
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  dealName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  dealValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  companyName: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stagePill: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  arrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 'auto',
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
