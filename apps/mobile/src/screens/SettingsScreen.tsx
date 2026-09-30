import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth, useSubscription, signOut } from '@kairo/api';

export function SettingsScreen() {
  const { user, profile } = useAuth();
  const { subscription, trialDaysLeft, canWrite } = useSubscription(user?.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Account & Subscription preferences</Text>
      </View>

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ACCOUNT</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={styles.infoValue}>{profile?.name || 'Not set'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email || 'Guest'}</Text>
        </View>
      </View>

      {/* Subscription Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SUBSCRIPTION STATUS</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text
            style={[
              styles.infoValue,
              { color: canWrite ? '#3DD68C' : '#FF667A', fontWeight: '700' },
            ]}
          >
            {subscription?.status?.toUpperCase() || (canWrite ? 'ACTIVE TRIAL' : 'EXPIRED')}
          </Text>
        </View>
        {trialDaysLeft !== null && (
          <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Trial Remaining</Text>
              <Text style={styles.infoValue}>{trialDaysLeft} Days</Text>
            </View>
          </>
        )}
      </View>

      {/* Sign Out Button */}
      {user && (
        <TouchableOpacity style={styles.signOutButton} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      )}
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
  card: {
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: '#302044',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#796B8A',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    color: '#796B8A',
    fontSize: 13,
  },
  infoValue: {
    color: '#F7F2FC',
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#302044',
    marginVertical: 10,
  },
  signOutButton: {
    backgroundColor: '#FF667A1A',
    borderColor: '#FF667A33',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: '#FF667A',
    fontSize: 13,
    fontWeight: '700',
  },
});
