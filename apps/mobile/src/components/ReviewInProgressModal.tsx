import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
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
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.sparkleIcon}>✦</Text>
          </View>
          <Text style={styles.title}>Review in Progress</Text>
          <Text style={styles.message}>
            {dealName ? (
              <>Review for this call of <Text style={styles.dealHighlight}>{dealName}</Text> is going on and will be available once it&apos;s complete.</>
            ) : (
              "Review for this call is going on and will be available once it's complete."
            )}
          </Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  sparkleIcon: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  dealHighlight: {
    color: colors.text.primary,
    fontWeight: '600',
  },
});
