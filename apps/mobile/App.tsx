import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '@kairo/api';
import { DashboardScreen } from './src/screens/DashboardScreen';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'record' | 'deals'>('dashboard');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0715" />

      {/* Main Content Area */}
      <View style={styles.content}>
        <DashboardScreen onRecordPress={() => setActiveTab('record')} />
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text style={[styles.navText, activeTab === 'dashboard' && styles.navTextActive]}>
            Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('record')}
        >
          <Text style={[styles.navText, activeTab === 'record' && styles.navTextActive]}>
            Record
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('deals')}
        >
          <Text style={[styles.navText, activeTab === 'deals' && styles.navTextActive]}>
            Deals
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0715',
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: '#160D21',
    borderTopWidth: 1,
    borderTopColor: '#302044',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  navText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#796B8A',
  },
  navTextActive: {
    color: '#7042C5',
  },
});
