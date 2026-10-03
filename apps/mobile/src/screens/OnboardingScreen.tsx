import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase, useAuth } from '@kairo/api';
import { colors } from '../theme/colors';

const WHO_OPTIONS = [
  { value: 'founder', label: 'Founder', desc: 'Running sales yourself at an early stage company' },
  { value: 'ae', label: 'Account Executive', desc: 'Full-cycle AE managing your own pipeline' },
  { value: 'consultant', label: 'Consultant or Agency', desc: 'Selling consulting, services, or agency work' },
  { value: 'freelancer', label: 'Freelancer', desc: 'Independent professional winning client work' },
  { value: 'other', label: 'Other', desc: 'Something else entirely' },
];

export function OnboardingScreen({ onCompleted }: { onCompleted?: () => void }) {
  const { user, profile, refetchProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [whatYouSell, setWhatYouSell] = useState(profile?.what_you_sell ?? '');
  const [whoYouAre, setWhoYouAre] = useState(profile?.who_you_are ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      if (profile.who_you_are && !whoYouAre) {
        setWhoYouAre(profile.who_you_are);
      }
      if (profile.what_you_sell && !whatYouSell) {
        setWhatYouSell(profile.what_you_sell);
      }
    }
  }, [profile]);

  async function handleStep1Continue() {
    if (!whoYouAre) {
      setError('Please select your role to continue.');
      return;
    }
    setError('');
    if (user) {
      try {
        await supabase.from('profiles').update({
          who_you_are: whoYouAre,
        }).eq('id', user.id);
      } catch {
        // non-blocking
      }
    }
    setStep(2);
  }

  async function handleFinish() {
    setError('');
    if (!user) {
      setError('You must be signed in to complete onboarding.');
      return;
    }
    if (!whoYouAre) {
      setError('Please select your role in Step 1.');
      setStep(1);
      return;
    }
    if (!whatYouSell || !whatYouSell.trim()) {
      setError('Please describe what you are selling.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.from('profiles').update({
        what_you_sell: whatYouSell.trim(),
        who_you_are: whoYouAre.trim(),
        onboarding_complete: true,
      }).eq('id', user.id);

      if (updateError) {
        setError('Failed to save onboarding information. Please try again.');
        setLoading(false);
        return;
      }

      await refetchProfile();
      if (onCompleted) {
        onCompleted();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.logo}>KAIRO</Text>
        <Text style={styles.stepIndicator}>STEP {step} OF 2</Text>
        <Text style={styles.title}>
          {step === 1 ? 'What best describes your role?' : 'What are you selling?'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1
            ? 'Kairo customizes deal intelligence and qualification criteria to match how you sell.'
            : 'Explain your product, ICP, and value proposition so Kairo AI can accurately audit deal evidence.'}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.optionsList}>
          {WHO_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.optionCard,
                whoYouAre === opt.value && styles.optionCardActive,
              ]}
              onPress={() => setWhoYouAre(opt.value)}
              activeOpacity={0.8}
            >
              <View style={styles.optionContent}>
                <Text
                  style={[
                    styles.optionTitle,
                    whoYouAre === opt.value && styles.optionTitleActive,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              <View
                style={[
                  styles.radioCircle,
                  whoYouAre === opt.value && styles.radioCircleActive,
                ]}
              >
                {whoYouAre === opt.value && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.continueButton, !whoYouAre && styles.buttonDisabled]}
            onPress={handleStep1Continue}
            disabled={!whoYouAre}
          >
            <Text style={styles.continueButtonText}>Continue ›</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.step2Container}>
          <View style={styles.field}>
            <Text style={styles.label}>Product & Offering Description</Text>
            <TextInput
              style={styles.textArea}
              placeholder="e.g. We sell enterprise B2B workflow software that helps sales teams close deals faster with AI intelligence..."
              placeholderTextColor={colors.text.tertiary}
              value={whatYouSell}
              onChangeText={setWhatYouSell}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              autoFocus
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(1)}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>‹ Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.finishButton,
                (!whatYouSell.trim() || loading) && styles.buttonDisabled,
              ]}
              onPress={handleFinish}
              disabled={!whatYouSell.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.finishButtonText}>Complete Setup</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  logo: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: 16,
  },
  stepIndicator: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
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
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  optionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  optionContent: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  optionTitleActive: {
    color: colors.primary,
  },
  optionDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  step2Container: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: colors.text.primary,
    height: 140,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  backButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  finishButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finishButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
