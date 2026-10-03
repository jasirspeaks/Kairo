import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { useNavigation } from '../../navigation/NavigationContext';
import { useAuth, useInboxCount } from '@kairo/api';

export function BottomNav() {
  const { activeTab, switchTab, navigate } = useNavigation();
  const { user } = useAuth();
  const inboxCount = useInboxCount(user?.id);

  return (
    <View style={styles.container}>
      {/* Home / Dashboard */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => switchTab('dashboard')}
        accessibilityLabel="Dashboard"
      >
        <Text style={[styles.tabIcon, activeTab === 'dashboard' && styles.tabActive]}>
          ⌂
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'dashboard' && styles.tabLabelActive]}>
          Home
        </Text>
      </TouchableOpacity>

      {/* Deals */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => switchTab('deals')}
        accessibilityLabel="Deals"
      >
        <Text style={[styles.tabIcon, activeTab === 'deals' && styles.tabActive]}>
          ▤
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'deals' && styles.tabLabelActive]}>
          Deals
        </Text>
      </TouchableOpacity>

      {/* Central Elevated FAB: New Deal */}
      <TouchableOpacity
        style={styles.fabContainer}
        onPress={() => navigate('new_deal')}
        accessibilityLabel="New Deal"
      >
        <View style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </View>
      </TouchableOpacity>

      {/* Inbox */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => switchTab('inbox')}
        accessibilityLabel="Inbox"
      >
        <View style={styles.iconWrapper}>
          <Text style={[styles.tabIcon, activeTab === 'inbox' && styles.tabActive]}>
            ✉
          </Text>
          {inboxCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{inboxCount > 9 ? '9+' : inboxCount}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.tabLabel, activeTab === 'inbox' && styles.tabLabelActive]}>
          Inbox
        </Text>
      </TouchableOpacity>

      {/* Settings */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => switchTab('settings')}
        accessibilityLabel="Settings"
      >
        <Text style={[styles.tabIcon, activeTab === 'settings' && styles.tabActive]}>
          ⚙
        </Text>
        <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
          Settings
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  tabActive: {
    color: colors.primary,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  fabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginTop: -2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
});
