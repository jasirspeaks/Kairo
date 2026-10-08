import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { createCheckoutSession, createCustomerPortalSession } from '../../lib/kairo';
import { Button } from '../../components/ui/Button';
import { DeleteAccountModal } from '../../components/ui/DeleteAccountModal';
import { TopBar } from '../../components/layout/TopBar';
import {
  CurrencyCode,
  AudioCapturePreferences,
  NotificationPreferences,
  DEFAULT_LOCAL_PREFERENCES,
} from '@kairo/core';
import {
  loadLocalPreferences,
  saveLocalPreferences,
} from '@kairo/platform';

// Modular Sections
import { SettingsNavigation, SettingsTabId } from './settings/SettingsNavigation';
import { SellerContextSection } from './settings/SellerContextSection';
import { AudioCaptureSection } from './settings/AudioCaptureSection';
import { IntegrationsSection } from './settings/IntegrationsSection';
import { NotificationsSection } from './settings/NotificationsSection';
import { PrivacySecuritySection } from './settings/PrivacySecuritySection';
import { BillingSection } from './settings/BillingSection';
import { AccountDangerSection } from './settings/AccountDangerSection';

async function readJsonResponse(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function Settings() {
  const { user, profile, signOut, refetchProfile } = useAuth();
  const {
    subscription,
    loading: subscriptionLoading,
    trialDaysLeft,
    isExpired,
  } = useSubscription(user?.id);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('context');
  const [highlightPlan, setHighlightPlan] = useState(false);

  // Profile context
  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');

  // Extended Intelligence & Hardware Preferences
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [customTerms, setCustomTerms] = useState('');
  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);
  const [capturePrefs, setCapturePrefs] = useState<AudioCapturePreferences>(
    DEFAULT_LOCAL_PREFERENCES.capture
  );
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    DEFAULT_LOCAL_PREFERENCES.notifications
  );

  // Baseline initial state for dirty checking
  const [initialState, setInitialState] = useState({
    name: '',
    whatYouSell: '',
    whoYouAre: '',
    currency: 'USD' as CurrencyCode,
    customTerms: '',
    fiscalStartMonth: 1,
    capturePrefs: DEFAULT_LOCAL_PREFERENCES.capture,
    notificationPrefs: DEFAULT_LOCAL_PREFERENCES.notifications,
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [calendarBanner, setCalendarBanner] = useState<'connected' | 'error' | null>(null);
  const [calendarErrorMessage, setCalendarErrorMessage] = useState('');
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  // Billing
  const [upgrading, setUpgrading] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [checkoutBanner, setCheckoutBanner] = useState<'success' | 'cancelled' | null>(null);

  // Account deletion
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Load preferences from local storage on mount
  useEffect(() => {
    const prefs = loadLocalPreferences();
    setCurrency(prefs.intelligence.currency);
    setCustomTerms(prefs.intelligence.custom_terms);
    setFiscalStartMonth(prefs.intelligence.fiscal_year_start_month);
    setCapturePrefs(prefs.capture);
    setNotificationPrefs(prefs.notifications);
  }, []);

  // Sync profile data once fetched
  useEffect(() => {
    if (!profile) return;

    const prefs = loadLocalPreferences();
    const next = {
      name: profile.name || '',
      whatYouSell: profile.what_you_sell || '',
      whoYouAre: profile.who_you_are || '',
      currency: prefs.intelligence.currency,
      customTerms: prefs.intelligence.custom_terms,
      fiscalStartMonth: prefs.intelligence.fiscal_year_start_month,
      capturePrefs: prefs.capture,
      notificationPrefs: prefs.notifications,
    };

    setName(next.name);
    setWhatYouSell(next.whatYouSell);
    setWhoYouAre(next.whoYouAre);
    setInitialState(next);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void checkCalendarConnection();
  }, [user]);

  // Handle URL query parameters (calendar callbacks, stripe checkout callbacks, tab deep-links)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTabId | null;
    if (tabParam && ['context', 'audio', 'integrations', 'notifications', 'privacy', 'billing', 'account'].includes(tabParam)) {
      setActiveTab(tabParam);
    }

    const calendarParam = searchParams.get('calendar');
    if (calendarParam === 'connected') {
      setActiveTab('integrations');
      setCalendarBanner('connected');
      setCalendarErrorMessage('');
      void checkCalendarConnection();

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('calendar');
      setSearchParams(nextParams, { replace: true });
      window.setTimeout(() => setCalendarBanner(null), 4000);
    } else if (calendarParam === 'error') {
      setActiveTab('integrations');
      setCalendarBanner('error');
      setCalendarErrorMessage('Google Calendar connection was cancelled or encountered an authentication error.');

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('calendar');
      setSearchParams(nextParams, { replace: true });
      window.setTimeout(() => setCalendarBanner(null), 7000);
    }

    const checkoutParam = searchParams.get('checkout');
    if (checkoutParam === 'success') {
      setActiveTab('billing');
      setCheckoutBanner('success');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('checkout');
      nextParams.delete('session_id');
      setSearchParams(nextParams, { replace: true });
      window.setTimeout(() => setCheckoutBanner(null), 6000);
    } else if (checkoutParam === 'cancelled') {
      setActiveTab('billing');
      setCheckoutBanner('cancelled');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('checkout');
      setSearchParams(nextParams, { replace: true });
      window.setTimeout(() => setCheckoutBanner(null), 5000);
    }

    if (searchParams.get('upgrade') === '1') {
      setActiveTab('billing');
      setHighlightPlan(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('upgrade');
      setSearchParams(nextParams, { replace: true });
      window.setTimeout(() => setHighlightPlan(false), 2500);
    }
  }, [searchParams, setSearchParams]);

  const isDirty =
    name !== initialState.name ||
    whatYouSell !== initialState.whatYouSell ||
    whoYouAre !== initialState.whoYouAre ||
    currency !== initialState.currency ||
    customTerms !== initialState.customTerms ||
    fiscalStartMonth !== initialState.fiscalStartMonth ||
    JSON.stringify(capturePrefs) !== JSON.stringify(initialState.capturePrefs) ||
    JSON.stringify(notificationPrefs) !== JSON.stringify(initialState.notificationPrefs);

  async function handleSave() {
    if (!user || !isDirty) return;

    setSaving(true);
    setSaveError(false);

    const normalized = {
      name: name.trim(),
      whatYouSell: whatYouSell.trim(),
      whoYouAre: whoYouAre.trim(),
    };

    // 1. Save profile to Supabase
    const { error } = await supabase
      .from('profiles')
      .update({
        name: normalized.name || null,
        what_you_sell: normalized.whatYouSell || null,
        who_you_are: normalized.whoYouAre || null,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Settings: profile update failed:', error);
      setSaving(false);
      setSaveError(true);
      window.setTimeout(() => setSaveError(false), 3000);
      return;
    }

    // 2. Save extended preferences locally
    saveLocalPreferences({
      intelligence: {
        currency,
        custom_terms: customTerms.trim(),
        fiscal_year_start_month: fiscalStartMonth,
      },
      capture: capturePrefs,
      notifications: notificationPrefs,
    });

    setSaving(false);
    setName(normalized.name);
    setWhatYouSell(normalized.whatYouSell);
    setWhoYouAre(normalized.whoYouAre);

    setInitialState({
      name: normalized.name,
      whatYouSell: normalized.whatYouSell,
      whoYouAre: normalized.whoYouAre,
      currency,
      customTerms: customTerms.trim(),
      fiscalStartMonth,
      capturePrefs,
      notificationPrefs,
    });

    void refetchProfile();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  }

  function handleDiscard() {
    setName(initialState.name);
    setWhatYouSell(initialState.whatYouSell);
    setWhoYouAre(initialState.whoYouAre);
    setCurrency(initialState.currency);
    setCustomTerms(initialState.customTerms);
    setFiscalStartMonth(initialState.fiscalStartMonth);
    setCapturePrefs(initialState.capturePrefs);
    setNotificationPrefs(initialState.notificationPrefs);
  }

  async function checkCalendarConnection() {
    if (!user) return;
    setCheckingCalendar(true);
    try {
      const { data, error } = await supabase.rpc('get_calendar_connection_status');
      if (error) {
        setCalendarConnected(false);
        return;
      }
      setCalendarConnected(Array.isArray(data) ? data.length > 0 : !!data);
    } catch {
      setCalendarConnected(false);
    } finally {
      setCheckingCalendar(false);
    }
  }

  async function handleConnectCalendar() {
    setConnectingCalendar(true);
    setCalendarBanner(null);
    setCalendarErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCalendarBanner('error');
        setCalendarErrorMessage('Your session expired. Please sign in again.');
        return;
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/google-calendar-connect`, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await readJsonResponse(res);
      if (!res.ok || !data.auth_url) {
        setCalendarBanner('error');
        setCalendarErrorMessage(data.error || 'Failed to initiate Google OAuth flow.');
        return;
      }

      window.location.assign(data.auth_url);
    } catch (err) {
      console.error('Settings: Calendar connect error:', err);
      setCalendarBanner('error');
      setCalendarErrorMessage('Network error connecting calendar.');
    } finally {
      setConnectingCalendar(false);
    }
  }

  async function handleDisconnectCalendar() {
    setDisconnectingCalendar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${supabaseUrl}/functions/v1/google-calendar-connect`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        setCalendarBanner('error');
        setCalendarErrorMessage('Failed to disconnect Google Calendar.');
        return;
      }

      setCalendarConnected(false);
    } catch {
      setCalendarBanner('error');
      setCalendarErrorMessage('Network error disconnecting calendar.');
    } finally {
      setDisconnectingCalendar(false);
    }
  }

  async function handleUpgrade() {
    setUpgrading(true);
    setBillingError('');
    try {
      const { url } = await createCheckoutSession();
      if (url) window.location.assign(url);
    } catch (err: any) {
      setBillingError(err.message || 'Could not initiate checkout.');
    } finally {
      setUpgrading(false);
    }
  }

  async function handleManageBilling() {
    setManagingBilling(true);
    setBillingError('');
    try {
      const { url } = await createCustomerPortalSession();
      if (url) window.location.assign(url);
    } catch (err: any) {
      setBillingError(err.message || 'Could not open billing management.');
    } finally {
      setManagingBilling(false);
    }
  }

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      {/* Mobile Top Bar */}
      <div className="-mx-4 md:hidden">
        <TopBar title="Settings" />
      </div>

      {/* Header */}
      <div className="mb-6 md:mb-8 hidden md:block">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
          Settings & Deal Co-Pilot
        </h1>
        <p className="text-textSecondary text-xs">
          Calibrate qualification reasoning, native audio hardware, calendar sync, and privacy controls.
        </p>
      </div>

      {/* Calendar Alert Banner */}
      {calendarBanner && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 mb-6 text-xs font-medium border ${
            calendarBanner === 'connected'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {calendarBanner === 'connected' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>
            {calendarBanner === 'connected'
              ? 'Google Calendar connected successfully.'
              : calendarErrorMessage || 'Calendar connection failed.'}
          </span>
        </div>
      )}

      {/* Main Two-Column Split Architecture */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 pb-32">
        <SettingsNavigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <div className="flex-1 min-w-0">
          {activeTab === 'context' && (
            <SellerContextSection
              name={name}
              setName={setName}
              whoYouAre={whoYouAre}
              setWhoYouAre={setWhoYouAre}
              whatYouSell={whatYouSell}
              setWhatYouSell={setWhatYouSell}
              email={profile?.email || user?.email || ''}
              currency={currency}
              setCurrency={setCurrency}
              customTerms={customTerms}
              setCustomTerms={setCustomTerms}
              fiscalStartMonth={fiscalStartMonth}
              setFiscalStartMonth={setFiscalStartMonth}
            />
          )}

          {activeTab === 'audio' && (
            <AudioCaptureSection
              capturePrefs={capturePrefs}
              setCapturePrefs={setCapturePrefs}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsSection
              calendarConnected={calendarConnected}
              checkingCalendar={checkingCalendar}
              connectingCalendar={connectingCalendar}
              disconnectingCalendar={disconnectingCalendar}
              onConnectCalendar={handleConnectCalendar}
              onDisconnectCalendar={handleDisconnectCalendar}
              onRefreshCalendar={checkCalendarConnection}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsSection
              notificationPrefs={notificationPrefs}
              setNotificationPrefs={setNotificationPrefs}
            />
          )}

          {activeTab === 'privacy' && (
            <PrivacySecuritySection userId={user?.id} />
          )}

          {activeTab === 'billing' && (
            <BillingSection
              subscription={subscription}
              subscriptionLoading={subscriptionLoading}
              trialDaysLeft={trialDaysLeft}
              isExpired={isExpired}
              upgrading={upgrading}
              managingBilling={managingBilling}
              billingError={billingError}
              checkoutBanner={checkoutBanner}
              highlightPlan={highlightPlan}
              onUpgrade={handleUpgrade}
              onManageBilling={handleManageBilling}
            />
          )}

          {activeTab === 'account' && (
            <AccountDangerSection
              email={profile?.email || user?.email || ''}
              onSignOut={signOut}
              onOpenDeleteModal={() => setDeleteModalOpen(true)}
            />
          )}
        </div>
      </div>

      <DeleteAccountModal
        open={deleteModalOpen}
        email={profile?.email || user?.email || ''}
        onClose={() => setDeleteModalOpen(false)}
      />

      {/* Floating Save Changes Pill */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-8 md:bottom-8 z-30 pb-safe-b md:pb-0">
          <div className="mx-4 mb-4 md:mx-0 md:mb-0 flex items-center justify-between md:justify-end gap-3 bg-surfaceSecondary border border-border rounded-xl shadow-card px-4 py-3 md:px-5">
            <span className="text-xs text-textSecondary md:hidden">Unsaved changes</span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="text-xs font-medium text-textMuted hover:text-textSecondary px-2 py-1"
              >
                Discard
              </button>

              <Button
                type="button"
                onClick={handleSave}
                loading={saving}
                size="sm"
                variant={saveError ? 'danger' : 'primary'}
              >
                {saveError ? 'Save Failed — Retry' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Temporary Just Saved Indicator */}
      {justSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-30 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg px-4 py-2.5 shadow-card">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Settings Saved
        </div>
      )}
    </div>
  );
}