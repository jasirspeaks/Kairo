import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { updateUserPassword } from '@kairo/api';
import { checkPasswordStrength, PasswordStrength } from '@kairo/core';
import { colors } from '../theme/colors';

const MIN_PASSWORD_LENGTH = 8;

const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: colors.red,
  fair: colors.amber,
  strong: colors.emerald,
};

export function ResetPasswordScreen({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = password ? checkPasswordStrength(password) : null;

  async function handleSubmit() {
    setError(null);

    const check = checkPasswordStrength(password);
    if (!check.isAcceptable) {
      setError(check.message);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await updateUserPassword(password);
      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
      } else {
        setSuccess(true);
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1500);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.glow} />

      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkLetter}>K</Text>
        </View>
        <Text style={styles.brandTitle}>
          {success ? 'Password Updated' : 'Set a New Password'}
        </Text>
        <Text style={styles.tagline}>
          {success
            ? 'Your password has been changed. Opening your pipeline...'
            : 'Choose a new password for your Kairo account.'}
        </Text>
      </View>

      <View style={styles.formContainer}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Password updated successfully!</Text>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>

            {strength && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthTrack}>
                  <View
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor: STRENGTH_COLOR[strength.strength],
                        width:
                          strength.strength === 'weak'
                            ? '33%'
                            : strength.strength === 'fair'
                            ? '66%'
                            : '100%',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.strengthMessage}>{strength.message}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Update Password</Text>
              )}
            </TouchableOpacity>

            {onCancel && (
              <TouchableOpacity style={styles.backLink} onPress={onCancel}>
                <Text style={styles.backLinkText}>‹ Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  glow: {
    position: 'absolute',
    top: 40,
    left: '25%',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(112, 66, 197, 0.12)',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoMarkLetter: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'serif',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  formContainer: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
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
  successBox: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  successText: {
    color: colors.successText,
    fontSize: 14,
    fontWeight: '700',
  },
  form: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
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
  strengthContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  strengthTrack: {
    height: 4,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthMessage: {
    fontSize: 11,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  backLink: {
    alignItems: 'center',
    marginTop: 12,
  },
  backLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
