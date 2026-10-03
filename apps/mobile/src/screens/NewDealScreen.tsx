import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  supabase,
  reviewCall,
  saveDealState,
  checkCalendarConnected,
  getDealLongitudinalHistory,
  useAuth,
  useSubscription,
} from '@kairo/api';
import { INITIAL_DEAL_STAGE, resolveDealStage } from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';
import { ScheduleMeetingSheet } from '../components/ui/ScheduleMeetingSheet';

type Step = 'deal' | 'transcript';

export function NewDealScreen() {
  const { user, profile } = useAuth();
  const { canWrite } = useSubscription(user?.id);
  const { navigate, goBack, routeParams } = useNavigation();

  const [step, setStep] = useState<Step>('deal');
  const [dealName, setDealName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);

  const scheduledDealIdRef = useRef<string | null>(null);
  const meetingScheduledRef = useRef(false);
  const callSucceeded = useRef(false);
  const dealIsPreexisting = useRef(false);

  // Bootstrap from routeParams when DealReview's "Add Call" navigates here
  useEffect(() => {
    const existingId = routeParams?.existingDealId;
    if (existingId) {
      scheduledDealIdRef.current = existingId;
      dealIsPreexisting.current = true;
      setStep('transcript');

      supabase
        .from('deals')
        .select('*')
        .eq('id', existingId)
        .single()
        .then(({ data }) => {
          if (data) {
            setDealName(data.deal_name || '');
            setCompanyName(data.company_name || '');
            if (data.deal_value) setDealValue(String(data.deal_value));
          }
        });
    }
  }, [routeParams?.existingDealId]);

  // Orphan deal cleanup: if created deal row but user navigated away before call submission or meeting schedule
  useEffect(() => {
    return () => {
      const dealIdToDelete = scheduledDealIdRef.current;
      if (dealIdToDelete && !callSucceeded.current && !meetingScheduledRef.current && !dealIsPreexisting.current) {
        supabase.from('deals').delete().eq('id', dealIdToDelete);
      }
    };
  }, []);

  async function createDealRow(): Promise<string | null> {
    if (!user) return null;
    const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[,$]/g, '')) : null;

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        user_id: user.id,
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: INITIAL_DEAL_STAGE,
        deal_value: parsedValue,
        status: 'active',
        risk_level: 'none',
      })
      .select()
      .single();

    if (dealError || !deal) {
      setError('Failed to create deal.');
      return null;
    }
    scheduledDealIdRef.current = deal.id;
    return deal.id;
  }

  async function handleScheduleFirstMeeting() {
    if (!dealName.trim() || !companyName.trim()) {
      setError('Please provide both Deal Name and Company Name.');
      return;
    }
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to add meetings and deals.'
      );
      return;
    }
    if (!user) return;
    setError('');
    setCreatingDeal(true);

    try {
      const isConnected = await checkCalendarConnected(user.id);
      if (!isConnected) {
        setError('Please connect Google Calendar in Settings first.');
        setCreatingDeal(false);
        return;
      }

      let dealId = scheduledDealIdRef.current;
      if (dealId) {
        const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[,$]/g, '')) : null;
        await supabase
          .from('deals')
          .update({
            deal_name: dealName.trim(),
            company_name: companyName.trim(),
            deal_value: parsedValue,
          })
          .eq('id', dealId);
      } else {
        dealId = await createDealRow();
        if (!dealId) {
          setCreatingDeal(false);
          return;
        }
      }

      setCreatingDeal(false);
      setShowScheduleSheet(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to prepare scheduling.');
      setCreatingDeal(false);
    }
  }

  function handleGoToTranscript() {
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to review new calls.'
      );
      return;
    }
    if (!dealName.trim() || !companyName.trim()) {
      setError('Please provide both Deal Name and Company Name.');
      return;
    }
    setError('');
    setStep('transcript');
  }

  async function handleGoToRecord() {
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to record new calls.'
      );
      return;
    }
    if (!dealName.trim() || !companyName.trim()) {
      setError('Please provide both Deal Name and Company Name.');
      return;
    }
    setError('');

    let dealId = scheduledDealIdRef.current;
    if (!dealId) {
      dealId = await createDealRow();
    }
    if (dealId) {
      navigate('record', { dealId });
    }
  }

  async function handleSubmitTranscript() {
    if (!user) return;
    if (!canWrite) {
      Alert.alert(
        'Upgrade Required',
        'Your trial has ended. Please upgrade your subscription in Settings to review new calls.'
      );
      return;
    }

    const text = transcript.trim();
    if (!text) {
      setError('Please paste a transcript before reviewing.');
      return;
    }
    if (text.length < 100) {
      setError('Transcript is too short. Must be at least 100 characters.');
      return;
    }
    if (text.length > 50000) {
      setError('Transcript is too long (maximum 50,000 characters).');
      return;
    }

    setAnalyzing(true);
    setError('');

    let dealId: string | null = scheduledDealIdRef.current;
    let createdDealHere = false;

    try {
      if (!dealId) {
        dealId = await createDealRow();
        if (!dealId) throw new Error('Failed to create deal.');
        createdDealHere = true;
      }

      let previousReview: any = null;
      let hist: any = null;
      let currentStage = INITIAL_DEAL_STAGE;

      if (dealIsPreexisting.current && dealId) {
        const [{ data: existingState }, { data: existingDeal }, histData] = await Promise.all([
          supabase.from('deal_state').select('*').eq('deal_id', dealId).maybeSingle(),
          supabase.from('deals').select('deal_stage').eq('id', dealId).maybeSingle(),
          getDealLongitudinalHistory(dealId).catch(() => null),
        ]);
        if (existingDeal?.deal_stage) currentStage = existingDeal.deal_stage;
        if (existingState) {
          previousReview = (existingState as any).deal ? existingState : { deal: existingState, call: null };
        }
        hist = histData;
      }

      const review = await reviewCall(text, {
        deal_id: dealId,
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: currentStage,
        previous_review: previousReview,
        longitudinal_history: hist || undefined,
        seller_context: {
          what_you_sell: profile?.what_you_sell || undefined,
          who_you_are: profile?.who_you_are || undefined,
        },
      });

      const resolvedStage = resolveDealStage(currentStage, review);

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: dealId,
          deal_stage: resolvedStage,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to save conversation.');

      await saveDealState(dealId, user.id, review, resolvedStage, conv.id);

      callSucceeded.current = true;
      navigate('call_review', { dealId, callId: conv.id });
    } catch (err: any) {
      if (dealId && createdDealHere) {
        await supabase.from('deals').delete().eq('id', dealId);
      }
      setError(err?.message || 'Something went wrong during analysis.');
      setAnalyzing(false);
    }
  }

  return (
    <View style={styles.container}>
      <TopBar
        title={step === 'deal' ? 'Create New Deal' : 'Analyze Call'}
        showBack
        onBackPress={() => {
          if (step === 'transcript' && !dealIsPreexisting.current) {
            setStep('deal');
          } else {
            goBack();
          }
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 'deal' ? (
          <View style={styles.formContainer}>
            <Text style={styles.sectionHeading}>DEAL BASICS</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Company / Account Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={colors.textMuted}
                value={companyName}
                onChangeText={setCompanyName}
                autoFocus
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Deal Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Acme Corp - Enterprise Expansion"
                placeholderTextColor={colors.textMuted}
                value={dealName}
                onChangeText={setDealName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Estimated Value ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50000"
                placeholderTextColor={colors.textMuted}
                value={dealValue}
                onChangeText={setDealValue}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.sectionHeading, { marginTop: 24 }]}>
              CHOOSE CAPTURE METHOD
            </Text>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={handleGoToTranscript}
              activeOpacity={0.7}
            >
              <View style={styles.optionIconBadge}>
                <Text style={styles.optionEmoji}>📄</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Paste Call Transcript</Text>
                <Text style={styles.optionSubtitle}>
                  Analyze an existing sales conversation transcript directly with Kairo AI
                </Text>
              </View>
              <Text style={styles.optionChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={handleGoToRecord}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIconBadge, { backgroundColor: colors.dangerBg }]}>
                <Text style={styles.optionEmoji}>🎙️</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Record Live Audio</Text>
                <Text style={styles.optionSubtitle}>
                  Capture mobile mic audio now and review deal intelligence
                </Text>
              </View>
              <Text style={styles.optionChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={handleScheduleFirstMeeting}
              activeOpacity={0.7}
              disabled={creatingDeal}
            >
              <View style={[styles.optionIconBadge, { backgroundColor: colors.primaryGlow }]}>
                <Text style={styles.optionEmoji}>📅</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Schedule in Google Calendar</Text>
                <Text style={styles.optionSubtitle}>
                  Create deal and open calendar to schedule the discovery meeting
                </Text>
              </View>
              {creatingDeal ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.optionChevron}>›</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <View style={styles.dealSummaryCard}>
              <Text style={styles.dealSummaryCompany}>{companyName}</Text>
              <Text style={styles.dealSummaryName}>{dealName}</Text>
              {dealValue ? (
                <Text style={styles.dealSummaryValue}>${dealValue}</Text>
              ) : null}
            </View>

            <Text style={styles.sectionHeading}>PASTE TRANSCRIPT</Text>
            <Text style={styles.hintText}>
              Paste the text from Zoom, Google Meet, Otter, or your meeting notes:
            </Text>

            <TextInput
              style={styles.transcriptInput}
              multiline
              numberOfLines={12}
              placeholder="Speaker 1: Hi, thanks for joining today...&#10;Speaker 2: Happy to be here. We are looking for a solution to..."
              placeholderTextColor={colors.textMuted}
              value={transcript}
              onChangeText={setTranscript}
              textAlignVertical="top"
              autoFocus
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                analyzing && styles.buttonDisabled,
              ]}
              onPress={handleSubmitTranscript}
              disabled={analyzing}
              activeOpacity={0.8}
            >
              {analyzing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} size="small" />
                  <Text style={styles.primaryButtonText}>Running 5-Pillar Analysis...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Run 5-Pillar Analysis</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {scheduledDealIdRef.current ? (
        <ScheduleMeetingSheet
          open={showScheduleSheet}
          onClose={() => {
            setShowScheduleSheet(false);
            if (meetingScheduledRef.current) {
              navigate('dashboard');
            }
          }}
          dealId={scheduledDealIdRef.current}
          dealName={dealName}
          companyName={companyName}
          onMeetingScheduled={() => {
            meetingScheduledRef.current = true;
          }}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
  },
  formContainer: {
    gap: 12,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  optionIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionEmoji: {
    fontSize: 20,
  },
  optionContent: {
    flex: 1,
    marginRight: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  optionChevron: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: '300',
  },
  dealSummaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  dealSummaryCompany: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  dealSummaryName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  dealSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.successText,
    marginTop: 4,
  },
  hintText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  transcriptInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 13,
    color: colors.textPrimary,
    height: 220,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
