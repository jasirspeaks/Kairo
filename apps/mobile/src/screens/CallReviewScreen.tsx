import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  getDeal,
  getConversations,
  useAuth,
  useSubscription,
  checkCalendarConnected,
} from '@kairo/api';
import {
  getCallStatusColor,
  type Deal,
  type Conversation,
} from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';
import { ScheduleMeetingSheet } from '../components/ui/ScheduleMeetingSheet';

export function CallReviewScreen({
  dealId,
  callId,
}: {
  dealId?: string;
  callId?: string;
}) {
  const { goBack, navigate } = useNavigation();
  const { user } = useAuth();
  const { canWrite } = useSubscription(user?.id);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [allCalls, setAllCalls] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);

  async function handleOpenScheduleSheet() {
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to schedule meetings.'
      );
      return;
    }
    if (!user) return;
    const isConn = await checkCalendarConnected(user.id);
    if (!isConn) {
      Alert.alert(
        'Calendar Not Connected',
        'Please connect Google Calendar in Settings to schedule meetings.'
      );
      return;
    }
    setShowScheduleSheet(true);
  }

  useEffect(() => {
    if (!dealId) return;
    loadCallData();
  }, [dealId, callId]);

  const loadCallData = async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const [dealData, callsData] = await Promise.all([
        getDeal(dealId),
        getConversations(dealId),
      ]);
      setDeal(dealData);
      const calls = callsData || [];
      setAllCalls(calls);
      const target = callId
        ? calls.find((c) => c.id === callId)
        : calls[calls.length - 1];
      setConv(target || null);
    } catch (err) {
      console.error('Failed to load call data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isLatestCall =
    conv && allCalls.length > 0 && conv.id === allCalls[allCalls.length - 1].id;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!conv || !['pending', 'processing', 'retry_pending'].includes(conv.status)) return;
    const interval = setInterval(() => {
      if (dealId) {
        getConversations(dealId).then((calls) => {
          const target = callId ? calls.find((c) => c.id === callId) : calls[calls.length - 1];
          if (target) setConv(target);
        }).catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [conv?.status, dealId, callId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (conv && (conv.status === 'pending' || conv.status === 'processing' || conv.status === 'retry_pending')) {
    return (
      <View style={styles.container}>
        <TopBar title={deal?.deal_name || 'Call Review'} onBack={goBack} />
        <View style={styles.errorContainer}>
          <ActivityIndicator color={colors.primary} size="large" style={{ marginBottom: 16 }} />
          <Text style={styles.errorTitle}>Analyzing Conversation</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
            {conv.status === 'retry_pending'
              ? 'AI review retry scheduled. Analyzing deal intelligence...'
              : 'Extracting 5-pillar deal intelligence, evidence, and risks...'}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>Back to Deal</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (conv && conv.status === 'failed') {
    return (
      <View style={styles.container}>
        <TopBar title={deal?.deal_name || 'Call Review'} onBack={goBack} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
            {conv.last_error || 'We encountered an issue analyzing this conversation.'}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>Back to Deal</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!deal || !conv || !conv.analysis_json) {
    return (
      <View style={styles.container}>
        <TopBar title="Call Review" onBack={goBack} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Review not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>Back to Deal</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const c = conv.analysis_json.call;
  const callStatus = c.call_status || 'On Track';
  const statusColor = getCallStatusColor(callStatus);

  return (
    <View style={styles.container}>
      <TopBar title={deal.deal_name} onBack={goBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Call Identity Header */}
        <View style={styles.identityRow}>
          <Text style={styles.companyName}>🏢 {deal.company_name}</Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: `${statusColor}1A`, borderColor: `${statusColor}4D` },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{callStatus}</Text>
          </View>
        </View>

        {/* Verdict Strip */}
        <View style={styles.verdictCard}>
          <Text style={styles.verdictMeta}>
            {deal.deal_stage} ·{' '}
            {new Date(conv.created_at).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.verdictText}>{c.verdict}</Text>
          {c.reason ? <Text style={styles.verdictReason}>{c.reason}</Text> : null}
        </View>

        {/* Highest Priority Risk */}
        {c.highest_priority_risk?.risk && (
          <View style={styles.heroRiskCard}>
            <Text style={styles.heroRiskTag}>HIGHEST PRIORITY RISK</Text>
            <Text style={styles.heroRiskTitle}>{c.highest_priority_risk.risk}</Text>
            {c.highest_priority_risk.why_it_matters && (
              <Text style={styles.heroRiskWhy}>
                {c.highest_priority_risk.why_it_matters}
              </Text>
            )}
            {c.highest_priority_risk.evidence && (
              <View style={styles.evidenceBox}>
                <Text style={styles.evidenceTag}>Evidence</Text>
                <Text style={styles.evidenceText}>
                  "{c.highest_priority_risk.evidence}"
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Missing Information */}
        {c.what_youre_missing && c.what_youre_missing.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>MISSING INFORMATION</Text>
            <View style={styles.missingList}>
              {c.what_youre_missing.map((item, idx) => (
                <View key={idx} style={styles.missingItem}>
                  <Text style={styles.missingGap}>{item.gap}</Text>
                  <Text style={styles.missingQuestion}>Ask: "{item.question_to_answer}"</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recommended Next Action */}
        {c.recommended_next_action && (
          <View style={styles.followUpCard}>
            <Text style={styles.followUpTag}>RECOMMENDED NEXT ACTION</Text>
            <Text style={styles.followUpText}>{c.recommended_next_action}</Text>
          </View>
        )}

        {/* Key Follow-up Message */}
        {c.key_follow_up_message && (
          <View style={styles.card}>
            <View style={styles.followUpHeader}>
              <Text style={styles.sectionLabel}>KEY FOLLOW-UP MESSAGE</Text>
              <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{c.key_follow_up_message}</Text>
            </View>
          </View>
        )}

        {/* Manager Note */}
        {c.manager_note && (
          <View style={styles.managerNoteCard}>
            <Text style={styles.managerNoteTag}>Manager Note</Text>
            <Text style={styles.managerNoteText}>{c.manager_note}</Text>
          </View>
        )}

        {/* Actions Bar for Latest Call */}
        {isLatestCall && (
          <View style={styles.actionsBar}>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={handleOpenScheduleSheet}
            >
              <Text style={styles.actionBtnSecondaryText}>📅 Schedule Meeting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => navigate('new_deal', { existingDealId: deal.id })}
            >
              <Text style={styles.actionBtnPrimaryText}>+ Add Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => navigate('record', { dealId: deal.id })}
            >
              <Text style={styles.actionBtnSecondaryText}>🎙️ Record Now</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {deal ? (
        <ScheduleMeetingSheet
          open={showScheduleSheet}
          onClose={() => setShowScheduleSheet(false)}
          dealId={deal.id}
          dealName={deal.deal_name}
          companyName={deal.company_name}
          onMeetingScheduled={loadCallData}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  companyName: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  verdictCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  verdictMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  verdictText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    lineHeight: 20,
  },
  verdictReason: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  heroRiskCard: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  heroRiskTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dangerText,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroRiskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  heroRiskWhy: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  evidenceBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  evidenceTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
  },
  evidenceText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  missingList: {
    gap: 8,
  },
  missingItem: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
  },
  missingGap: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  missingQuestion: {
    fontSize: 11,
    color: colors.primary,
  },
  followUpCard: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  followUpTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  followUpText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  followUpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  copyBtnText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  messageBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 12,
  },
  messageText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  managerNoteCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  managerNoteTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  managerNoteText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  actionsBar: {
    gap: 8,
    marginTop: 4,
    paddingBottom: 20,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnPrimaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnSecondaryText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
});
