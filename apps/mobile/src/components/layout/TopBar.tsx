import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  onBackPress?: () => void;
  action?: React.ReactNode;
}

export function TopBar({
  title,
  subtitle,
  onBack,
  showBack,
  onBackPress,
  action,
}: TopBarProps) {
  const handleBack = onBackPress || onBack;
  const shouldShowBack = showBack || !!handleBack;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {shouldShowBack && handleBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.center}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>{action || null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  right: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backIcon: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '300',
    marginTop: -2,
  },
  backText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});
