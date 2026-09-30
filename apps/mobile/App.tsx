import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@kairo/api';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DealsScreen } from './src/screens/DealsScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AuthScreen } from './src/screens/AuthScreen';

type Tab = 'dashboard' | 'deals' | 'record' | 'inbox' | 'settings';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#7042C5" size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0715" />
        <AuthScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0715" />

      {/* Main Content Area */}
      <View style={styles.content}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onRecordPress={() => setActiveTab('record')}
            onDealPress={() => setActiveTab('deals')}
          />
        )}
        {activeTab === 'deals' && <DealsScreen />}
        {activeTab === 'record' && <RecordScreen />}
        {activeTab === 'inbox' && <InboxScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text
            style={[
              styles.navText,
              activeTab === 'dashboard' && styles.navTextActive,
            ]}
          >
            Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('deals')}
        >
          <Text
            style={[
              styles.navText,
              activeTab === 'deals' && styles.navTextActive,
            ]}
          >
            Deals
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('record')}
        >
          <Text
            style={[
              styles.navText,
              activeTab === 'record' && styles.navTextActive,
            ]}
          >
            Record
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('inbox')}
        >
          <Text
            style={[
              styles.navText,
              activeTab === 'inbox' && styles.navTextActive,
            ]}
          >
            Inbox
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('settings')}
        >
          <Text
            style={[
              styles.navText,
              activeTab === 'settings' && styles.navTextActive,
            ]}
          >
            Settings
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
  center: {
    flex: 1,
    backgroundColor: '#0D0715',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: '#160D21',
    borderTopWidth: 1,
    borderTopColor: '#302044',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  navItem: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  navText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#796B8A',
  },
  navTextActive: {
    color: '#7042C5',
    fontWeight: '700',
  },
});
