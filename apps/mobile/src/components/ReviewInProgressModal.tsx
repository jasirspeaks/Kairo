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
            {/* Notification Body */}
            <View style={styles.contentContainer}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>Review in Progress</Text>
                <TouchableOpacity
                  onPress={onDismiss}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.message} numberOfLines={2}>
                {dealName ? (
                  <>Review for this call of <Text style={styles.dealHighlight}>{dealName}</Text> is in progress and will be available once complete.</>
                ) : (
                  'Review for this call is in progress and will be available once complete.'
                )}
              </Text>

              <View style={styles.actionRow}>
                <Text style={styles.actionText}>Go to Deal Review</Text>
                <Text style={styles.actionChevron}>›</Text>
              </View>
            </View>
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  contentContainer: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 2,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  dealHighlight: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  actionChevron: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
