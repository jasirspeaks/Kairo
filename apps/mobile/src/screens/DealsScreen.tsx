import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth, getDeals } from '@kairo/api';
import { formatDealValue, Deal } from '@kairo/core';

export function DealsScreen() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchDeals();
  }, [user]);

  async function fetchDeals() {
    setLoading(true);
    try {
      const data = await getDeals(user!.id);
      setDeals(data);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredDeals = deals.filter(
    (d) =>
      d.company_name.toLowerCase().includes(search.toLowerCase()) ||
      d.deal_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.champion && d.champion.toLowerCase().includes(search.toLowerCase()))
  );

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
        <Text style={styles.title}>Deals Catalog</Text>
        <Text style={styles.subtitle}>All active opportunities</Text>
      </View>

      {/* Search Bar */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search company or opportunity..."
        placeholderTextColor="#796B8A"
        value={search}
        onChangeText={setSearch}
      />

      {/* Deals List */}
      <View style={styles.list}>
        {filteredDeals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No matching deals found.</Text>
          </View>
        ) : (
          filteredDeals.map((deal) => (
            <View key={deal.id} style={styles.dealCard}>
              <View style={styles.dealTop}>
                <Text style={styles.companyName}>{deal.company_name}</Text>
                <Text style={styles.dealValue}>{formatDealValue(deal.deal_value)}</Text>
              </View>

              <Text style={styles.dealName}>{deal.deal_name}</Text>

              <View style={styles.badgeRow}>
                <View style={styles.stageBadge}>
                  <Text style={styles.stageText}>{deal.deal_stage}</Text>
                </View>

                <View
                  style={[
                    styles.riskBadge,
                    deal.risk_level === 'high'
                      ? styles.riskHigh
                      : deal.risk_level === 'medium'
                      ? styles.riskMedium
                      : styles.riskLow,
                  ]}
                >
                  <Text style={styles.riskText}>
                    {deal.risk_level ? `${deal.risk_level.toUpperCase()} RISK` : 'NORMAL'}
                  </Text>
                </View>
              </View>
            </View>
          ))
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
  searchInput: {
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: '#302044',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F7F2FC',
    fontSize: 13,
    marginBottom: 16,
  },
  list: {
    gap: 10,
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
    borderWidth: 1,
    borderColor: '#302044',
  },
  dealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyName: {
    color: '#F7F2FC',
    fontSize: 14,
    fontWeight: '700',
  },
  dealValue: {
    color: '#3DD68C',
    fontSize: 13,
    fontWeight: '600',
  },
  dealName: {
    color: '#796B8A',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stageBadge: {
    backgroundColor: '#201330',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#302044',
  },
  stageText: {
    color: '#F7F2FC',
    fontSize: 10,
    fontWeight: '600',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  riskHigh: {
    backgroundColor: '#FF667A22',
  },
  riskMedium: {
    backgroundColor: '#F6B23E22',
  },
  riskLow: {
    backgroundColor: '#3DD68C22',
  },
  riskText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F7F2FC',
  },
});
