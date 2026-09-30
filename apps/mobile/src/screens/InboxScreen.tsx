import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export function InboxScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Action Inbox</Text>
        <Text style={styles.subtitle}>AI-extracted action items & commitments</Text>
      </View>

      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>All Caught Up!</Text>
        <Text style={styles.emptySubtitle}>
          No pending action items or blocked follow-ups found.
        </Text>
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
  emptyCard: {
    backgroundColor: '#160D21',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#302044',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#F7F2FC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#796B8A',
    fontSize: 12,
    textAlign: 'center',
  },
});
