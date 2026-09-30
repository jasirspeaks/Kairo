import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth, getDashboardDeals, syncGoogleCalendar, DealWithState } from '@kairo/api';
import { getStatusStyle, getRiskLevel } from '@kairo/core';

export function DashboardScreen({ onRecordPress }: { onRecordPress?: () => void }) {
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    syncGoogleCalendar().then(fetchData);
  }, [user]);

  async function fetchData() {
    try {
      const activeDeals = await getDashboardDeals(user!.id);
      setDeals(activeDeals);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7042C5" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User greeting */}
      <View style={styles.header}>
        <Text style={styles.title}>Deal Intelligence</Text>
        <Text style={styles.subtitle}>
          {profile?.name ? `Welcome back, ${profile.name}` : 'Active Pipeline'}
        </Text>
      </View>

      {/* Quick Record CTA */}
      <TouchableOpacity style={styles.recordButton} onPress={onRecordPress}>
        <Text style={styles.recordButtonText}>+ Record Call</Text>
      </TouchableOpacity>

      {/* Active Deals List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DEALS REQUIRING ATTENTION ({deals.length})</Text>
        {deals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active deals requiring attention.</Text>
          </View>
        ) : (
          deals.map((deal) => {
            const risk = getRiskLevel(deal.deal_state?.current_status || 'Unknown');
            return (
              <View key={deal.id} style={styles.dealCard}>
                <View style={[styles.riskIndicator, risk === 'high' ? styles.riskHigh : styles.riskMedium]} />
                <View style={styles.dealInfo}>
                  <Text style={styles.dealName}>{deal.deal_name}</Text>
                  <Text style={styles.companyName}>{deal.company_name}</Text>
                  {deal.deal_state?.highest_priority_risk && (
                    <Text style={styles.riskText} numberOfLines={2}>
                      {deal.deal_state.highest_priority_risk}
                    </Text>
                  )}
                </View>
              </View>
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
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    backgroundColor: '#0D0715',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F7F2FC',
  },
  subtitle: {
    fontSize: 14,
    color: '#B4A7C2',
    marginTop: 4,
  },
  recordButton: {
    backgroundColor: '#7042C5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#796B8A',
    letterSpacing: 1,
    marginBottom: 12,
  },
  dealCard: {
    backgroundColor: '#160D21',
    borderColor: '#302044',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
  },
  riskIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  riskHigh: {
    backgroundColor: '#FF667A',
  },
  riskMedium: {
    backgroundColor: '#F6B23E',
  },
  dealInfo: {
    flex: 1,
  },
  dealName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F7F2FC',
  },
  companyName: {
    fontSize: 12,
    color: '#B4A7C2',
    marginTop: 2,
  },
  riskText: {
    fontSize: 12,
    color: '#FF667A',
    marginTop: 6,
  },
  emptyCard: {
    backgroundColor: '#160D21',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#302044',
  },
  emptyText: {
    color: '#796B8A',
    fontSize: 13,
  },
});
