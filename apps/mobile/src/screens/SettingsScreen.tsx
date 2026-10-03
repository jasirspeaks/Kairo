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
import { TopBar } from '../components/layout/TopBar';
import { useNavigation } from '../navigation/NavigationContext';

const ROLE_OPTIONS = [
  { value: 'founder', label: 'Founder', desc: 'Running sales at an early stage company' },
  { value: 'ae', label: 'Account Executive', desc: 'Full-cycle AE managing pipeline' },
  { value: 'consultant', label: 'Consultant / Agency', desc: 'Selling consulting or client services' },
  { value: 'freelancer', label: 'Freelancer', desc: 'Winning independent client work' },
  { value: 'other', label: 'Other', desc: 'Something else entirely' },
];

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SettingsScreen() {
  const { user, profile, refetchProfile } = useAuth();
  const { routeParams } = useNavigation();
  const {
    subscription,
    loading: subscriptionLoading,
    trialDaysLeft,
    canWrite,
    isExpired,
  } = useSubscription(user?.id);

  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [initialValues, setInitialValues] = useState({ name: '', whatYouSell: '', whoYouAre: '' });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  useEffect(() => {
    if (profile) {
      const init = {
        name: profile.name || '',
        whatYouSell: profile.what_you_sell || '',
        whoYouAre: profile.who_you_are || '',
      };
      setName(init.name);
      setWhatYouSell(init.whatYouSell);
      setWhoYouAre(init.whoYouAre);
      setInitialValues(init);
    }
  }, [profile]);

  const checkCalendar = async () => {
    if (!user) return;
    setLoadingCalendar(true);
    try {
      const isConn = await checkCalendarConnected(user.id);
      setCalendarConnected(isConn);
    } catch {
      setCalendarConnected(false);
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    checkCalendar();
  }, [user]);

  useEffect(() => {
    if (routeParams?.calendar) {
      checkCalendar();
      if (routeParams.calendar === 'connected') {
        Alert.alert('Calendar Connected', 'Your Google Calendar has been successfully connected.');
      } else if (routeParams.calendar === 'error') {
        Alert.alert('Calendar Error', 'Failed to connect Google Calendar. Please try again.');
      }
    }
  }, [routeParams?.calendar]);

  const isDirty =
    name !== initialValues.name ||
    whatYouSell !== initialValues.whatYouSell ||
    whoYouAre !== initialValues.whoYouAre;

  async function handleSave() {
    if (!user || !isDirty) return;
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
      setInitialValues({ name: name.trim(), whatYouSell: whatYouSell.trim(), whoYouAre });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile settings.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setName(initialValues.name);
    setWhatYouSell(initialValues.whatYouSell);
    setWhoYouAre(initialValues.whoYouAre);
  }

  async function handleConnectCalendar() {
    if (!user) return;
    setConnectingCalendar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('google-calendar-connect?platform=mobile', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-kairo-platform': 'mobile',
        },
      });
      if (error || !data?.auth_url) throw error || new Error(data?.error || 'No auth URL returned');
      await Linking.openURL(data.auth_url);
    } catch (err: any) {
      Alert.alert('Calendar Error', err?.message || 'Failed to initiate Google Calendar connection.');
    } finally {
      setConnectingCalendar(false);
    }
  }

  async function handleDisconnectCalendar() {
    if (!user) return;
    setDisconnectingCalendar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('google-calendar-connect', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setCalendarConnected(false);
      Alert.alert('Calendar', 'Google Calendar disconnected.');
    } catch (err: any) {
      Alert.alert('Disconnect Error', err?.message || 'Failed to disconnect calendar.');
    } finally {
      setDisconnectingCalendar(false);
    }
  }

  async function handleUpgrade() {
    if (!user) return;
    setUpgrading(true);
    try {
      const res = await createCheckoutSession();
      if (res?.url) {
        await Linking.openURL(res.url);
      }
    } catch (err: any) {
      Alert.alert('Billing Error', err?.message || 'Failed to open checkout.');
    } finally {
      setUpgrading(false);
    }
  }

  async function handleManageBilling() {
    if (!user) return;
    setManagingBilling(true);
    try {
      const res = await createCustomerPortalSession();
      if (res?.url) {
        await Linking.openURL(res.url);
      }
    } catch (err: any) {
      Alert.alert('Billing Error', err?.message || 'Failed to open billing portal.');
    } finally {
      setManagingBilling(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of Kairo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    if (!user || !user.email) return;
    Alert.alert(
      'Delete Account',
      'This will permanently delete your Kairo account, active deals, transcripts, and intelligence history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error('Session expired. Please sign in again.');

              const { data, error } = await supabase.functions.invoke('delete-account', {
                body: { confirm_email: user.email },
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (error || data?.error) throw error || new Error(data?.error);

              await signOut();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete account.');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Settings" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>PROFILE</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleList}>
              {ROLE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.roleOption, whoYouAre === r.value && styles.roleOptionActive]}
                  onPress={() => setWhoYouAre(r.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.roleRadio}>
                    {whoYouAre === r.value && <View style={styles.roleRadioDot} />}
                  </View>
                  <View style={styles.roleContent}>
                    <Text
                      style={[
                        styles.roleLabel,
                        whoYouAre === r.value && styles.roleLabelActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                    <Text style={styles.roleDesc}>{r.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={user?.email || ''}
              editable={false}
            />
          </View>
        </View>

        {/* Selling Context Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>SELLING CONTEXT</Text>
          <Text style={styles.cardHint}>
            Kairo uses this to frame deal reviews more accurately for your specific situation.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>What are you selling?</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. SaaS product for HR teams, B2B consulting for fintech companies, marketing agency services..."
              placeholderTextColor={colors.textMuted}
              value={whatYouSell}
              onChangeText={setWhatYouSell}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.hintUnder}>
              Be specific — the more context, the sharper the analysis.
            </Text>
          </View>
        </View>

        {/* Integrations Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>INTEGRATIONS</Text>

          <View style={styles.integrationRow}>
            <View style={styles.integrationLeft}>
              <Text style={styles.integrationTitle}>📅 Google Calendar</Text>
              <Text style={styles.integrationDesc}>
                Sync upcoming meetings so you can assign them to deals and review calls automatically.
              </Text>
              <Text style={styles.integrationStatus}>
                {loadingCalendar
                  ? 'Checking connection...'
                  : calendarConnected
                  ? '🟢 Connected & active'
                  : '⚪ Not connected'}
              </Text>
            </View>

            <View style={styles.integrationAction}>
              {calendarConnected ? (
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={handleDisconnectCalendar}
                  disabled={disconnectingCalendar}
                >
                  <Text style={styles.disconnectBtnText}>
                    {disconnectingCalendar ? 'Disconnecting...' : 'Disconnect'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.connectBtn}
                  onPress={handleConnectCalendar}
                  disabled={connectingCalendar}
                >
                  <Text style={styles.connectBtnText}>
                    {connectingCalendar ? 'Connecting...' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Plan & Subscription Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>SUBSCRIPTION PLAN</Text>

          {subscriptionLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : !subscription ? (
            <Text style={styles.hintUnder}>Could not load subscription details.</Text>
          ) : (
            <View style={styles.subContent}>
              {subscription.status === 'trialing' && (
                <View style={styles.subBanner}>
                  <Text style={styles.subBannerTitle}>
                    {trialDaysLeft === 0
                      ? 'Your trial ends today'
                      : `${trialDaysLeft} days left in your trial`}
                  </Text>
                  <Text style={styles.subBannerDesc}>
                    Trial ends {formatDate(subscription.trial_end)}. After that, adding new deals and calls pauses until you upgrade.
                  </Text>
                  <TouchableOpacity
                    style={styles.upgradeBtn}
                    onPress={handleUpgrade}
                    disabled={upgrading}
                  >
                    <Text style={styles.upgradeBtnText}>
                      {upgrading ? 'Loading...' : 'Upgrade Early'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {subscription.status === 'active' && (
                <View style={styles.subBannerActive}>
                  <Text style={styles.subBannerActiveTitle}>✓ Active Pro Subscription</Text>
                  {subscription.current_period_end && (
                    <Text style={styles.subBannerDesc}>
                      Renews {formatDate(subscription.current_period_end)}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={handleManageBilling}
                    disabled={managingBilling}
                  >
                    <Text style={styles.manageBtnText}>
                      {managingBilling ? 'Loading...' : 'Manage Billing'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {isExpired && (
                <View style={styles.subBannerExpired}>
                  <Text style={styles.subBannerExpiredTitle}>Trial Expired</Text>
                  <Text style={styles.subBannerDesc}>
                    Your access has expired. Upgrade to Pro to continue creating and reviewing deals.
                  </Text>
                  <TouchableOpacity
                    style={styles.upgradeBtn}
                    onPress={handleUpgrade}
                    disabled={upgrading}
                  >
                    <Text style={styles.upgradeBtnText}>
                      {upgrading ? 'Loading...' : 'Upgrade to Pro'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Account Info */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>ACCOUNT</Text>
          <View style={styles.accountRow}>
            <Text style={styles.signedInText}>Signed in as {profile?.email || user?.email}</Text>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={[styles.card, styles.dangerZoneCard]}>
          <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
          <Text style={styles.dangerZoneDesc}>
            Permanently delete your account and all associated pipeline data.
          </Text>
          <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
            <Text style={styles.deleteAccountBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky Unsaved Changes Bar */}
      {isDirty && (
        <View style={styles.unsavedBar}>
          <Text style={styles.unsavedText}>Unsaved changes</Text>
          <View style={styles.unsavedActions}>
            <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>
                  {saveSuccess ? '✓ Saved' : 'Save Changes'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    paddingBottom: 80,
    gap: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  cardHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    height: 90,
  },
  hintUnder: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  roleList: {
    gap: 8,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  roleOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  roleRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  roleContent: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  roleLabelActive: {
    color: colors.primary,
  },
  roleDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  integrationRow: {
    gap: 8,
  },
  integrationLeft: {
    gap: 4,
  },
  integrationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  integrationDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  integrationStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 4,
  },
  integrationAction: {
    marginTop: 8,
  },
  connectBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  connectBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  disconnectBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  disconnectBtnText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },
  subContent: {
    gap: 10,
  },
  subBanner: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  subBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  subBannerDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  subBannerActive: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  subBannerActiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.successText,
  },
  subBannerExpired: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  subBannerExpiredTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warningText,
  },
  upgradeBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  upgradeBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  manageBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  manageBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signedInText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  signOutBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dangerZoneCard: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  dangerZoneTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dangerText,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dangerZoneDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  deleteAccountBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteAccountBtnText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '700',
  },
  unsavedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  unsavedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  unsavedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  discardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  discardBtnText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
