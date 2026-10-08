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
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAuth,
  useSubscription,
  signOut,
  checkCalendarConnected,
  createCustomerPortalSession,
  createCheckoutSession,
  supabase,
} from '@kairo/api';
import { CurrencyCode } from '@kairo/core';
import { colors } from '../theme/colors';
import { TopBar } from '../components/layout/TopBar';
import { useNavigation } from '../navigation/NavigationContext';

const MOBILE_PREFS_KEY = 'kairo_mobile_preferences_v1';

const ROLE_OPTIONS = [
  { value: 'ae', label: 'Account Executive', desc: 'Full-cycle AE managing pipeline' },
  { value: 'founder', label: 'Founder', desc: 'Running founder-led sales' },
  { value: 'consultant', label: 'Consultant / Agency', desc: 'Selling professional client services' },
  { value: 'freelancer', label: 'Freelancer', desc: 'Winning independent client projects' },
  { value: 'other', label: 'Other', desc: 'Other sales capacity' },
];

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'USD', label: 'USD ($)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'CAD', label: 'CAD (C$)' },
  { code: 'AUD', label: 'AUD (A$)' },
];

type SettingsSection = 'context' | 'capture' | 'integrations' | 'plan';

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
    isExpired,
  } = useSubscription(user?.id);

  const [activeSection, setActiveSection] = useState<SettingsSection>('context');

  // Profile & Context
  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [customTerms, setCustomTerms] = useState('');

  // Mobile Hardware & Data Preferences
  const [wifiOnly, setWifiOnly] = useState(true);

  // Baseline initial values for dirty tracking
  const [initialValues, setInitialValues] = useState({
    name: '',
    whatYouSell: '',
    whoYouAre: '',
    currency: 'USD' as CurrencyCode,
    customTerms: '',
    wifiOnly: true,
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Calendar
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  // Billing
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  // Load local mobile preferences
  useEffect(() => {
    async function loadPrefs() {
      try {
        const raw = await AsyncStorage.getItem(MOBILE_PREFS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.currency) setCurrency(parsed.currency);
          if (parsed.customTerms) setCustomTerms(parsed.customTerms);
          if (parsed.wifiOnly !== undefined) setWifiOnly(parsed.wifiOnly);
        }
      } catch (err) {
        console.warn('Failed to load mobile settings:', err);
      }
    }
    loadPrefs();
  }, []);

  // Sync profile data
  useEffect(() => {
    if (profile) {
      const init = {
        name: profile.name || '',
        whatYouSell: profile.what_you_sell || '',
        whoYouAre: profile.who_you_are || '',
        currency,
        customTerms,
        wifiOnly,
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
        setActiveSection('integrations');
        Alert.alert('Calendar Connected', 'Your Google Calendar has been successfully connected to Kairo.');
      } else if (routeParams.calendar === 'error') {
        setActiveSection('integrations');
        Alert.alert('Calendar Error', 'Failed to connect Google Calendar. Please try again.');
      }
    }
  }, [routeParams?.calendar]);

  const isDirty =
    name !== initialValues.name ||
    whatYouSell !== initialValues.whatYouSell ||
    whoYouAre !== initialValues.whoYouAre ||
    currency !== initialValues.currency ||
    customTerms !== initialValues.customTerms ||
    wifiOnly !== initialValues.wifiOnly;

  async function handleSave() {
    if (!user || !isDirty) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      // 1. Update Supabase Profile
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim() || null,
          what_you_sell: whatYouSell.trim() || null,
          who_you_are: whoYouAre || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      // 2. Persist mobile preferences in AsyncStorage
      await AsyncStorage.setItem(
        MOBILE_PREFS_KEY,
        JSON.stringify({
          currency,
          customTerms: customTerms.trim(),
          wifiOnly,
        })
      );

      await refetchProfile();
      setInitialValues({
        name: name.trim(),
        whatYouSell: whatYouSell.trim(),
        whoYouAre,
        currency,
        customTerms: customTerms.trim(),
        wifiOnly,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setName(initialValues.name);
    setWhatYouSell(initialValues.whatYouSell);
    setWhoYouAre(initialValues.whoYouAre);
    setCurrency(initialValues.currency);
    setCustomTerms(initialValues.customTerms);
    setWifiOnly(initialValues.wifiOnly);
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
      if (res?.url) await Linking.openURL(res.url);
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
      if (res?.url) await Linking.openURL(res.url);
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
      'This will permanently purge your Kairo account, active deals, transcripts, audio recordings, and intelligence history. Any active paid subscription will be immediately canceled with Stripe with no refund. This cannot be undone.',
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
                body: { confirm_email: user.email, cancel_stripe_subscription: true },
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

      {/* Segmented Control Bar */}
      <View style={styles.segmentBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
          {[
            { id: 'context', label: 'Profile & AI' },
            { id: 'capture', label: 'Audio & Privacy' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'plan', label: 'Plan & Account' },
          ].map((seg) => {
            const isActive = activeSection === seg.id;
            return (
              <TouchableOpacity
                key={seg.id}
                style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                onPress={() => setActiveSection(seg.id as SettingsSection)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {seg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ========================================================================= */}
        {/* SECTION 1: PROFILE & CONTEXT                                              */}
        {/* ========================================================================= */}
        {activeSection === 'context' && (
          <>
            {/* Qualification Philosophy Banner */}
            <View style={styles.philosophyBanner}>
              <Text style={styles.philosophyTitle}>Deal Intelligence & 5-Pillar Reasoning</Text>
              <Text style={styles.philosophyText}>
                Kairo evaluates conversations against 5 qualification pillars (Compelling Event, Economic Buyer, Decision Process, Budget Reality, Champion Strength) with a strictly skeptical posture to eliminate happy-ears optimism.
              </Text>
            </View>

            {/* Profile Card */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>SELLER PERSONA</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
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
                        <Text style={[styles.roleLabel, whoYouAre === r.value && styles.roleLabelActive]}>
                          {r.label}
                        </Text>
                        <Text style={styles.roleDesc}>{r.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Account Email (Read-only)</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={user?.email || ''}
                  editable={false}
                />
              </View>
            </View>

            {/* What You Sell */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>PRODUCT & VALUE PROPOSITION</Text>
              <Text style={styles.cardHint}>
                Describe your solution, target buyers, and average deal sizes. Kairo uses this context to catch hidden deal-killing unknowns.
              </Text>

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. B2B enterprise security SaaS ($50k-$100k ACV) sold to CISOs and Security Architects..."
                placeholderTextColor={colors.textMuted}
                value={whatYouSell}
                onChangeText={setWhatYouSell}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Currency & Custom Terms */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>PIPELINE DEFAULTS & GLOSSARY</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Pipeline Currency</Text>
                <View style={styles.currencyRow}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.currencyPill, currency === c.code && styles.currencyPillActive]}
                      onPress={() => setCurrency(c.code)}
                    >
                      <Text style={[styles.currencyText, currency === c.code && styles.currencyTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Custom Terms & Competitor Names</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Gong, Clari, HIPAA, SOC2, ARR, MEDDPICC"
                  placeholderTextColor={colors.textMuted}
                  value={customTerms}
                  onChangeText={setCustomTerms}
                />
                <Text style={styles.hintUnder}>
                  Assists speech-to-text recognition during transcription.
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: AUDIO & PRIVACY                                                */}
        {/* ========================================================================= */}
        {activeSection === 'capture' && (
          <>
            {/* Mobile Bandwidth Settings */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>MOBILE DATA & RECORDING</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Text style={styles.switchTitle}>Upload Recordings on Wi-Fi Only</Text>
                  <Text style={styles.switchDesc}>
                    Save cellular data. When enabled, completed in-person recordings sync only once connected to Wi-Fi.
                  </Text>
                </View>
                <Switch
                  value={wifiOnly}
                  onValueChange={setWifiOnly}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            {/* 48-Hour Purge Policy */}
            <View style={styles.card}>
              <View style={styles.badgeRow}>
                <Text style={styles.sectionHeading}>48-HOUR AUTOMATED AUDIO PURGE</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>✓ Active</Text>
                </View>
              </View>

              <Text style={styles.cardHint}>
                In accordance with enterprise data protection standards, raw audio files are automatically purged from secure storage within 48 hours of transcription.
              </Text>
              <Text style={styles.infoBullet}>
                • Only verified text transcripts and structured deal qualification evidence remain in your database.
              </Text>
              <Text style={styles.infoBullet}>
                • Purged audio cannot be recovered.
              </Text>
            </View>

            {/* Model Training Guarantee */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>CONFIDENTIALITY COMMITMENT</Text>
              <Text style={styles.cardHint}>
                Your conversations, customer quotes, and deal metrics are strictly isolated and never used to train public or commercial AI models.
              </Text>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL('https://kairo.app/privacy').catch(() => {})}
              >
                <Text style={styles.linkBtnText}>View Privacy Policy ↗</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ========================================================================= */}
        {/* SECTION 3: INTEGRATIONS                                                   */}
        {/* ========================================================================= */}
        {activeSection === 'integrations' && (
          <>
            {/* Google Calendar */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>GOOGLE CALENDAR</Text>
              <Text style={styles.cardHint}>
                Sync upcoming sales calls to your Kairo Inbox so you can link them to deals beforehand and review automatically afterwards.
              </Text>

              <View style={styles.integrationStatusRow}>
                <Text style={styles.integrationStatusText}>
                  {loadingCalendar
                    ? 'Checking sync status...'
                    : calendarConnected
                    ? '🟢 Connected & syncing meetings'
                    : '⚪ Not connected'}
                </Text>
              </View>

              <View style={styles.integrationBtnRow}>
                {calendarConnected ? (
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={handleDisconnectCalendar}
                    disabled={disconnectingCalendar}
                  >
                    <Text style={styles.disconnectBtnText}>
                      {disconnectingCalendar ? 'Disconnecting...' : 'Disconnect Calendar'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.connectBtn}
                    onPress={handleConnectCalendar}
                    disabled={connectingCalendar}
                  >
                    <Text style={styles.connectBtnText}>
                      {connectingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Outlook / Office 365 */}
            <View style={[styles.card, styles.cardMuted]}>
              <View style={styles.badgeRow}>
                <Text style={styles.sectionHeading}>MICROSOFT 365 / OUTLOOK</Text>
                <View style={styles.roadmapBadge}>
                  <Text style={styles.roadmapBadgeText}>Enterprise Roadmap</Text>
                </View>
              </View>
              <Text style={styles.cardHint}>
                Corporate Exchange and Office 365 calendar synchronization for enterprise sales teams.
              </Text>
            </View>

            {/* CRM Sync */}
            <View style={[styles.card, styles.cardMuted]}>
              <View style={styles.badgeRow}>
                <Text style={styles.sectionHeading}>SALESFORCE & HUBSPOT CRM</Text>
                <View style={styles.roadmapBadge}>
                  <Text style={styles.roadmapBadgeText}>Coming Soon</Text>
                </View>
              </View>
              <Text style={styles.cardHint}>
                Bi-directional sync of qualification pillars, suggested stages, and scheduled follow-ups.
              </Text>
            </View>
          </>
        )}

        {/* ========================================================================= */}
        {/* SECTION 4: PLAN & ACCOUNT                                                 */}
        {/* ========================================================================= */}
        {activeSection === 'plan' && (
          <>
            {/* Subscription */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>SUBSCRIPTION TIER</Text>

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
                          : `${trialDaysLeft} days left in trial`}
                      </Text>
                      <Text style={styles.subBannerDesc}>
                        Trial ends {formatDate(subscription.trial_end)}. After that, adding new deals pauses until upgraded.
                      </Text>
                      <TouchableOpacity
                        style={styles.upgradeBtn}
                        onPress={handleUpgrade}
                        disabled={upgrading}
                      >
                        <Text style={styles.upgradeBtnText}>
                          {upgrading ? 'Loading...' : 'Upgrade to Pro Early'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {subscription.status === 'active' && (
                    <View style={styles.subBannerActive}>
                      <Text style={styles.subBannerActiveTitle}>✓ Active Pro Subscription</Text>
                      {subscription.current_period_end && (
                        <Text style={styles.subBannerDesc}>
                          Renews {formatDate(subscription.current_period_end)} via Stripe
                        </Text>
                      )}
                      <TouchableOpacity
                        style={styles.manageBtn}
                        onPress={handleManageBilling}
                        disabled={managingBilling}
                      >
                        <Text style={styles.manageBtnText}>
                          {managingBilling ? 'Loading...' : 'Manage Billing & Invoices'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isExpired && (
                    <View style={styles.subBannerExpired}>
                      <Text style={styles.subBannerExpiredTitle}>Trial Expired</Text>
                      <Text style={styles.subBannerDesc}>
                        Upgrade to Pro to resume creating and reviewing deals.
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

            {/* Account Credentials */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>ACCOUNT CREDENTIALS</Text>
              <View style={styles.accountRow}>
                <View>
                  <Text style={styles.accountEmailLabel}>Signed in as</Text>
                  <Text style={styles.signedInText}>{user?.email}</Text>
                </View>
                <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                  <Text style={styles.signOutBtnText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Danger Zone */}
            <View style={[styles.card, styles.dangerZoneCard]}>
              <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
              <Text style={styles.dangerZoneDesc}>
                Permanently purge your account, all deals, meeting transcripts, and intelligence history.
              </Text>
              <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
                <Text style={styles.deleteAccountBtnText}>Delete Account Permanently</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
  segmentBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  segmentScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
    gap: 16,
  },
  philosophyBanner: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  philosophyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  philosophyText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  cardMuted: {
    opacity: 0.75,
    borderStyle: 'dashed',
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  cardHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
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
    opacity: 0.5,
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
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  currencyPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  currencyText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  currencyTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLeft: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 11,
    color: colors.successText,
    fontWeight: '700',
  },
  roadmapBadge: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roadmapBadgeText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  infoBullet: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  linkBtn: {
    marginTop: 6,
  },
  linkBtnText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  integrationStatusRow: {
    marginBottom: 10,
  },
  integrationStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  integrationBtnRow: {
    marginTop: 4,
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
  accountEmailLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  signedInText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
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
    color: colors.dangerText,
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
    backgroundColor: colors.surfaceElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unsavedText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  unsavedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  discardBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
});
