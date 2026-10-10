import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { colors } from '../theme/colors';

interface ReviewInProgressModalProps {
  visible: boolean;
  dealName?: string;
  onDismiss: () => void;
  durationMs?: number;
}

export function ReviewInProgressModal({
  visible,
  dealName,
  onDismiss,
  durationMs = 4000,
}: ReviewInProgressModalProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <View style={styles.islandContainer}>
          <TouchableOpacity
            style={styles.islandCard}
            activeOpacity={0.9}
            onPress={onDismiss}
          >
            {/* Left Glyph */}
            <View style={styles.iconContainer}>
              <Text style={styles.sparkleIcon}>✦</Text>
            </View>

            {/* Notification Body */}
            <View style={styles.contentContainer}>
              {/* Header Pill */}
              <View style={styles.headerRow}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgeText}>KAIRO</Text>
                </View>
                <Text style={styles.nowText}>· NOW</Text>
              </View>

              <View style={styles.titleRow}>
                <Text style={styles.title}>Review in Progress</Text>
                <View style={styles.liveDot} />
              </View>

              <Text style={styles.message} numberOfLines={2}>
                {dealName ? (
                  <>Review for this call of <Text style={styles.dealHighlight}>{dealName}</Text> is going on and will be available once complete.</>
                ) : (
                  "Review for this call is going on and will be available once complete."
                )}
              </Text>
            </View>

            {/* Close button */}
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 48 : 20,
    paddingHorizontal: 12,
  },
  islandContainer: {
    width: '100%',
  },
  islandCard: {
    backgroundColor: '#160D21',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(112, 66, 197, 0.2)',
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkleIcon: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  badgePill: {
    backgroundColor: '#211333',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 32, 68, 0.6)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  nowText: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  message: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dealHighlight: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
