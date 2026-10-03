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
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import {
  signInWithPassword,
  signUp,
  resetPasswordForEmail,
  supabase,
} from '@kairo/api';
import { parseDeepLinkUrl } from '@kairo/platform';
import { colors } from '../theme/colors';
import { ResetPasswordScreen } from './ResetPasswordScreen';

WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export function AuthScreen({
  initialMode = 'signin',
  onAuthSuccess,
}: {
  initialMode?: AuthMode;
  onAuthSuccess?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const redirectUrl = Linking.createURL('auth/callback');

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) throw oauthError;
      if (!data?.url) throw new Error('No authentication URL returned from Google.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const params = parseDeepLinkUrl(result.url);

        if (params.error || params.error_description) {
          throw new Error(
            decodeURIComponent(params.error_description || params.error || 'Authentication failed.').replace(/\+/g, ' ')
          );
        }

        if (params.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw exchangeError;
        } else if (params.access_token && params.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (sessionError) throw sessionError;
        }

        if (onAuthSuccess) {
          onAuthSuccess();
        }
      }
      // If user cancelled/dismissed, we simply do nothing
    } catch (err: any) {
      setError(err?.message || 'Google sign in could not be completed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (mode !== 'forgot' && !password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await signUp({ email: email.trim(), password });
        if (signUpError) throw signUpError;

        if (data.session) {
          if (onAuthSuccess) onAuthSuccess();
        } else {
          setSuccessMessage('Account created! Please check your email to verify your account or sign in.');
        }
      } else if (mode === 'signin') {
        const { error: signInError } = await signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        if (onAuthSuccess) onAuthSuccess();
      } else if (mode === 'forgot') {
        const redirectUrl = Linking.createURL('auth/reset-password');
        const { error: resetError } = await resetPasswordForEmail(email.trim(), redirectUrl);
        if (resetError) throw resetError;
        setSuccessMessage("If an account exists, we've sent a link to reset your password. Open it on this device to set a new password.");
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'reset') {
    return (
      <ResetPasswordScreen
        onSuccess={() => {
          setMode('signin');
          if (onAuthSuccess) onAuthSuccess();
        }}
        onCancel={() => {
          setMode('signin');
          setError(null);
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Ambient Top Glow */}
      <View style={styles.glow} />

      {/* Brand Hero */}
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkLetter}>K</Text>
        </View>
        <Text style={styles.brandTitle}>Kairo</Text>
        <Text style={styles.tagline}>Know what you're missing before it costs you.</Text>
      </View>

      {/* Auth Container */}
      <View style={styles.authContainer}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {!showEmailForm && mode === 'signin' ? (
          <View style={styles.buttonOptions}>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emailOptionButton}
              onPress={() => {
                setShowEmailForm(true);
                setError(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.emailIcon}>✉</Text>
              <Text style={styles.emailOptionButtonText}>Continue with Email</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            {mode === 'signin' && (
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => {
                  setShowEmailForm(false);
                  setError(null);
                }}
              >
                <Text style={styles.backLinkText}>‹ Back</Text>
              </TouchableOpacity>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@company.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus={showEmailForm}
              />
            </View>

            {mode !== 'forgot' && (
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  {mode === 'signin' && (
                    <TouchableOpacity
                      onPress={() => {
                        setMode('forgot');
                        setError(null);
                        setSuccessMessage(null);
                      }}
                    >
                      <Text style={styles.forgotLink}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
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
                <Text style={styles.primaryButtonText}>
                  {mode === 'signup'
                    ? 'Create Account'
                    : mode === 'forgot'
                    ? 'Send Reset Link'
                    : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Footer switch between modes */}
        <View style={styles.footer}>
          {mode === 'signin' ? (
            <TouchableOpacity
              onPress={() => {
                setMode('signup');
                setShowEmailForm(true);
                setError(null);
                setSuccessMessage(null);
              }}
            >
              <Text style={styles.footerText}>
                Don't have an account? <Text style={styles.footerLink}>Create one</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setMode('signin');
                setShowEmailForm(false);
                setError(null);
                setSuccessMessage(null);
              }}
            >
              <Text style={styles.footerText}>
                Already have an account? <Text style={styles.footerLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
    marginBottom: 40,
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
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 18,
  },
  authContainer: {
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
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: colors.successText,
    fontSize: 13,
  },
  buttonOptions: {
    gap: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emailOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  emailIcon: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  emailOptionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  form: {
    gap: 14,
  },
  backLink: {
    marginBottom: 4,
  },
  backLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  forgotLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: '700',
  },
});
