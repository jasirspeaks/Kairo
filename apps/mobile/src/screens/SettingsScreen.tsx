import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {
  useAuth,
  useSubscription,
  signOut,
  checkCalendarConnected,
  createCustomerPortalSession,
  createCheckoutSession,
  supabase,
} from '@kairo/api';
import { colors } from '../theme/colors';

const ROLE_OPTIONS = [
  { value: 'founder', label: 'Founder' },
  { value: 'ae', label: 'Account Executive' },
  { value: 'consultant', label: 'Consultant / Agency' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'other', label: 'Other' },
];

export function SettingsScreen() {
  const { user, profile, refetchProfile } = useAuth();
  const { subscription, trialDaysLeft, canWrite } = useSubscription(user?.id);

  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(true);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setWhatYouSell(profile.what_you_sell || '');
      setWhoYouAre(profile.who_you_are || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    checkCalendarConnected(user.id)
      .then(setCalendarConnected)
      .finally(() => setLoadingCalendar(false));
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          what_you_sell: whatYouSell.trim(),
          who_you_are: whoYouAre,
        })
        .eq('id', user.id);

      if (error) throw error;
      await refetchProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    }
  }

  async function handleConnectCalendar() {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { return_url: 'https://kairo.internal/settings' },
      });
      if (error || !data?.url) throw error || new Error('No auth URL returned');
      await Linking.openURL(data.url);
    } catch (err: any) {
      Alert.alert('Calendar Error', err?.message || 'Failed to initiate Google Calendar connection.');
    }
  }

  async function handleUpgrade() {
    if (!user) return;
    try {
      const res = await createCheckoutSession();
      if (res?.url) {
        await Linking.openURL(res.url);
      }
    } catch (err: any) {
      Alert.alert('Billing Error', err?.message || 'Failed to open checkout.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Account, selling context & integrations</Text>
      </View>

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ACCOUNT INFORMATION</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={user?.email || 'Guest'}
            editable={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Your Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Alex Smith"
            placeholderTextColor={colors.text.tertiary}
            value={name}
            onChangeText={setName}
          />
        </View>
      </View>

      {/* Selling Context */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SELLING CONTEXT (KAIRO AI)</Text>
        <Text style={styles.cardHint}>
          This context helps Kairo accurately evaluate qualification criteria, risks, and next steps for your sales model.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Your Role</Text>
          <View style={styles.roleGrid}>
            {ROLE_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[
                  styles.rolePill,
                  whoYouAre === r.value && styles.rolePillActive,
                ]}
                onPress={() => setWhoYouAre(r.value)}
              >
                <Text
                  style={[
                    styles.rolePillText,
                    whoYouAre === r.value && styles.rolePillTextActive,
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>What You Sell (Product / Pitch)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="e.g. Enterprise AI customer support automation for mid-market SaaS companies with 50+ agents..."
            placeholderTextColor={colors.text.tertiary}
            value={whatYouSell}
            onChangeText={setWhatYouSell}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>
              {saveSuccess ? '✓ Saved!' : 'Save Selling Context'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Google Calendar */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>INTEGRATIONS</Text>

        <View style={styles.integrationRow}>
          <View style={styles.integrationInfo}>
            <Text style={styles.integrationName}>Google Calendar</Text>
            <Text style={styles.integrationStatus}>
              {loadingCalendar
                ? 'Checking...'
                : calendarConnected
                ? '🟢 Connected & syncing'
                : '⚪ Not connected'}
            </Text>
          </View>

          {!calendarConnected && (
            <TouchableOpacity
              style={styles.connectButton}
              onPress={handleConnectCalendar}
            >
              <Text style={styles.connectButtonText}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Subscription & Billing */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SUBSCRIPTION & BILLING</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Plan Status</Text>
          <Text
            style={[
              styles.infoValue,
              { color: canWrite ? colors.successText : colors.dangerText, fontWeight: '700' },
            ]}
          >
            {subscription?.status?.toUpperCase() || (canWrite ? 'ACTIVE TRIAL' : 'EXPIRED')}
          </Text>
        </View>

        {trialDaysLeft !== null && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Trial Remaining</Text>
            <Text style={styles.infoValue}>{trialDaysLeft} Days</Text>
          </View>
        )}

        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeButtonText}>Manage Subscription / Upgrade</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out of Kairo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    marginTop: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 0.8,
  },
  cardHint: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text.primary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    height: 90,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  rolePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  rolePillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  integrationInfo: {
    flex: 1,
  },
  integrationName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  integrationStatus: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  upgradeButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '700',
  },
});
