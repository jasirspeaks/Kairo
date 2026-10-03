import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { colors } from '../../theme/colors';
import { DealEvidence, DealRisk, PillarKey, PILLAR_LABELS } from '@kairo/core';

interface EvidenceInspectorSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  pillarKey?: PillarKey | null;
  risk?: DealRisk | null;
  evidence: DealEvidence[];
}

export function EvidenceInspectorSheet({
  open,
  onClose,
  title,
  pillarKey,
  risk,
  evidence,
}: EvidenceInspectorSheetProps) {
  const filteredEvidence = React.useMemo(() => {
    if (pillarKey) {
      return evidence.filter((e) => e.pillar_key === pillarKey);
    }
    if (risk) {
      return evidence;
    }
    return evidence;
  }, [pillarKey, risk, evidence]);

  const displayTitle =
    title ||
    (pillarKey ? PILLAR_LABELS[pillarKey] : risk ? risk.title : 'Transcript Evidence');

  return (
    <BottomSheet open={open} onClose={onClose} title={displayTitle}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {risk && (
          <View style={styles.riskCard}>
            <Text style={styles.riskTitle}>{risk.title}</Text>
            {risk.why_it_matters && (
              <Text style={styles.riskWhy}>{risk.why_it_matters}</Text>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>VERBATIM TRANSCRIPT EVIDENCE</Text>

        {filteredEvidence.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No specific quote extracted for this item yet.
            </Text>
          </View>
        ) : (
          filteredEvidence.map((item, idx) => (
            <View key={item.id || idx} style={styles.quoteCard}>
              <View style={styles.quoteHeader}>
                <Text style={styles.speakerText}>
                  {item.speaker || 'Prospect / Speaker'}
                </Text>
                <View style={styles.confidencePill}>
                  <Text style={styles.confidenceText}>
                    {item.confidence ? `${item.confidence}% Match` : 'Grounding'}
                  </Text>
                </View>
              </View>
              <Text style={styles.quoteBody}>"{item.quote}"</Text>
              <Text style={styles.groundingType}>
                Type: {item.grounding_type.replace('_', ' ')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 400,
  },
  content: {
    paddingBottom: 20,
  },
  riskCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF667A33',
    marginBottom: 16,
  },
  riskTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  riskWhy: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  quoteCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  speakerText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  confidencePill: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 9,
    color: colors.emerald,
    fontWeight: '700',
  },
  quoteBody: {
    fontSize: 12,
    color: colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  groundingType: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 6,
    textTransform: 'capitalize',
  },
});
