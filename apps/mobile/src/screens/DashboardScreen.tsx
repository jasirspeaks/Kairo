import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth, getDashboardDeals, type DealWithState } from '@kairo/api';
import { formatDealValue, getHealthScoreColor } from '@kairo/core';

interface DashboardScreenProps {
  onRecordPress?: () => void;
  onDealPress?: (dealId: string) => void;
}

export function DashboardScreen({ onRecordPress, onDealPress }: DashboardScreenProps) {
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    try {
      const activeDeals = await getDashboardDeals(user!.id);
      setDeals(activeDeals);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }

  const totalValue = deals.reduce((acc, d) => acc + (d.deal_value || 0), 0);
  const highRiskCount = deals.filter((d) => d.risk_level === 'high').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7042C5" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Kairo Intelligence</Text>
        <Text style={styles.subtitle}>
          {profile?.name ? `Welcome back, ${profile.name}` : 'Active Opportunities'}
        </Text>
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>PIPELINE</Text>
          <Text style={styles.metricValue}>{formatDealValue(totalValue)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>ACTIVE</Text>
          <Text style={styles.metricValue}>{deals.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>HIGH RISK</Text>
          <Text style={[styles.metricValue, { color: '#FF667A' }]}>{highRiskCount}</Text>
        </View>
      </View>

      {/* Quick Record CTA */}
      <TouchableOpacity style={styles.recordButton} onPress={onRecordPress}>
        <Text style={styles.recordButtonText}>+ Record Call</Text>
      </TouchableOpacity>

      {/* Active Deals List */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACTIVE PIPELINE ({deals.length})</Text>
        </View>

        {deals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active deals in qualification cycle.</Text>
          </View>
        ) : (
          deals.map((deal) => {
            const score = deal.deal_state?.deal_health_score ?? 50;
            const healthColor = getHealthScoreColor(score);

            return (
              <TouchableOpacity
                key={deal.id}
                style={styles.dealCard}
                onPress={() => onDealPress?.(deal.id)}
              >
                <View style={[styles.scoreBadge, { borderColor: healthColor }]}>
                  <Text style={[styles.scoreText, { color: healthColor }]}>{score}</Text>
                </View>

                <View style={styles.dealInfo}>
                  <View style={styles.dealTopRow}>
                    <Text style={styles.companyName}>{deal.company_name}</Text>
                    <Text style={styles.dealValue}>{formatDealValue(deal.deal_value)}</Text>
                  </View>

                  <Text style={styles.dealMeta}>
                    {deal.deal_name} • {deal.deal_stage}
                  </Text>

                  {deal.deal_state?.highest_priority_risk && (
                    <Text style={styles.riskText} numberOfLines={2}>
                      Risk: {deal.deal_state.highest_priority_risk}
                    </Text>
                  )}
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
    backgroundColor: '#0D0715',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: '#0D0715',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F7F2FC',
  },
  subtitle: {
    fontSize: 13,
    color: '#796B8A',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: '#302044',
    borderRadius: 12,
    padding: 12,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#796B8A',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F7F2FC',
    marginTop: 4,
  },
  recordButton: {
    backgroundColor: '#7042C5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#796B8A',
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: '#160D21',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#302044',
  },
  emptyText: {
    color: '#796B8A',
    fontSize: 13,
  },
  dealCard: {
    backgroundColor: '#160D21',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#302044',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#201330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  dealInfo: {
    flex: 1,
  },
  dealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyName: {
    color: '#F7F2FC',
    fontSize: 14,
    fontWeight: '600',
  },
  dealValue: {
    color: '#F7F2FC',
    fontSize: 13,
    fontWeight: '600',
  },
  dealMeta: {
    color: '#796B8A',
    fontSize: 12,
    marginTop: 2,
  },
  riskText: {
    color: '#FF667A',
    fontSize: 11,
    marginTop: 4,
  },
});
