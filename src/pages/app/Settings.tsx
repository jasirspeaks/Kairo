import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Copy,
  Check,
  Zap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { DeleteAccountModal } from '../../components/ui/DeleteAccountModal';
import { TopBar } from '../../components/layout/TopBar';
import { formatDate } from '../../lib/utils';

type FirefliesStatus = 'pending' | 'active' | 'invalid' | 'disconnected';

interface FirefliesConnectionState {
  connected: boolean;
  status?: FirefliesStatus;
  email?: string | null;
  last_webhook_received_at?: string | null;
  last_error?: string | null;
  webhook_url?: string;
  webhook_secret?: string;
}

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
    canWrite,
    isExpired,
    trialDaysLeft,
  } = useSubscription(user?.id);

  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightPlan, setHighlightPlan] = useState(false);

  // Profile / selling context
  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [initialValues, setInitialValues] = useState({
    name: '',
    whatYouSell: '',
    whoYouAre: '',
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

  // Fireflies
  const [fireflies, setFireflies] = useState<FirefliesConnectionState | null>(null);
  const [checkingFireflies, setCheckingFireflies] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [connectingFireflies, setConnectingFireflies] = useState(false);
  const [firefliesFormError, setFirefliesFormError] = useState<string | null>(null);
  const [firefliesActionError, setFirefliesActionError] = useState<string | null>(null);
  const [disconnectingFireflies, setDisconnectingFireflies] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);

  // Account deletion
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isDirty =
    name !== initialValues.name ||
    whatYouSell !== initialValues.whatYouSell ||
    whoYouAre !== initialValues.whoYouAre;

  useEffect(() => {
    if (!profile) return;

    const next = {
      name: profile.name || '',
      whatYouSell: profile.what_you_sell || '',
      whoYouAre: profile.who_you_are || '',
    };

    setName(next.name);
    setWhatYouSell(next.whatYouSell);
    setWhoYouAre(next.whoYouAre);
    setInitialValues(next);
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    void checkCalendarConnection();
    void checkFirefliesConnection();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const calendarParam = searchParams.get('calendar');

    if (calendarParam === 'connected') {
      setCalendarBanner('connected');
      setCalendarErrorMessage('');

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('calendar');
      setSearchParams(nextParams, { replace: true });

      window.setTimeout(() => setCalendarBanner(null), 4000);
    } else if (calendarParam === 'error') {
      setCalendarBanner('error');
      setCalendarErrorMessage(
        'Something went wrong connecting your calendar. Please check your Google OAuth configuration and try again.'
      );

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('calendar');
      setSearchParams(nextParams, { replace: true });

      window.setTimeout(() => setCalendarBanner(null), 7000);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get('upgrade') !== '1') return;

    setHighlightPlan(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('upgrade');
    setSearchParams(nextParams, { replace: true });

    window.setTimeout(() => setHighlightPlan(false), 2500);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------

  async function checkCalendarConnection() {
    if (!user) return;

    setCheckingCalendar(true);

    try {
      const { data, error } = await supabase
        .from('calendar_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (error) {
        console.error('Settings: failed to check calendar connection:', error);
        setCalendarConnected(false);
        return;
      }

      setCalendarConnected(!!data);
    } catch (error) {
      console.error('Settings: calendar connection check failed:', error);
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setCalendarBanner('error');
        setCalendarErrorMessage(
          'Your session expired. Refresh the page and try again.'
        );
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/google-calendar-connect`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok || !data.auth_url) {
        setCalendarBanner('error');
        setCalendarErrorMessage(
          data.error ||
            `Calendar connection could not be started (${res.status}).`
        );
        return;
      }

      window.location.assign(data.auth_url);
    } catch (error) {
      console.error('Settings: calendar connect failed:', error);
      setCalendarBanner('error');
      setCalendarErrorMessage(
        'Network error reaching Kairo. Please check your connection and try again.'
      );
    } finally {
      setConnectingCalendar(false);
    }
  }

  async function handleDisconnectCalendar() {
    setDisconnectingCalendar(true);
    setCalendarBanner(null);
    setCalendarErrorMessage('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setCalendarBanner('error');
        setCalendarErrorMessage(
          'Your session expired. Refresh the page and try again.'
        );
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/google-calendar-connect`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok) {
        setCalendarBanner('error');
        setCalendarErrorMessage(
          data.error ||
            `Calendar could not be disconnected (${res.status}).`
        );
        return;
      }

      setCalendarConnected(false);

      if (data.google_revoked === false) {
        setCalendarBanner('error');
        setCalendarErrorMessage(
          'Calendar was disconnected from Kairo, but Google did not revoke the OAuth grant. You can remove Kairo access from your Google account settings.'
        );
      }
    } catch (error) {
      console.error('Settings: calendar disconnect failed:', error);
      setCalendarBanner('error');
      setCalendarErrorMessage(
        'Network error disconnecting your calendar. Please try again.'
      );
    } finally {
      setDisconnectingCalendar(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Fireflies
  // ---------------------------------------------------------------------------

  const firefliesAuthHeader = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return null;

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  async function checkFirefliesConnection() {
    setCheckingFireflies(true);

    try {
      const authHeader = await firefliesAuthHeader();

      if (!authHeader) {
        setFireflies(null);
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=status`,
        {
          method: 'GET',
          headers: authHeader,
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok) {
        console.error(
          'Settings: Fireflies status request failed:',
          data.error || res.status
        );
        setFireflies(null);
        setFirefliesActionError(
          data.error || `Could not load Fireflies status (${res.status}).`
        );
        return;
      }

      setFireflies(data);
    } catch (error) {
      console.error('Settings: Fireflies status check failed:', error);
      setFireflies(null);
      setFirefliesActionError(
        'Network error checking the Fireflies connection.'
      );
    } finally {
      setCheckingFireflies(false);
    }
  }

  async function handleConnectFireflies(e: React.FormEvent) {
    e.preventDefault();

    const apiKey = apiKeyInput.trim();

    if (!apiKey) {
      setFirefliesFormError('Paste your Fireflies API key first.');
      return;
    }

    setConnectingFireflies(true);
    setFirefliesFormError(null);
    setFirefliesActionError(null);

    try {
      const authHeader = await firefliesAuthHeader();

      if (!authHeader) {
        setFirefliesFormError(
          'Your session expired — refresh the page and try again.'
        );
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({
            api_key: apiKey,
          }),
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok || data.error) {
        setFirefliesFormError(
          data.error ||
            `Could not connect Fireflies (${res.status}).`
        );
        return;
      }

      setApiKeyInput('');
      setSecretRevealed(true);
      await checkFirefliesConnection();
    } catch (error) {
      console.error('Settings: Fireflies connect failed:', error);
      setFirefliesFormError(
        'Network error reaching Fireflies. Please try again.'
      );
    } finally {
      setConnectingFireflies(false);
    }
  }

  async function handleDisconnectFireflies() {
    setDisconnectingFireflies(true);
    setFirefliesActionError(null);
    setFirefliesFormError(null);

    try {
      const authHeader = await firefliesAuthHeader();

      if (!authHeader) {
        setFirefliesActionError(
          'Your session expired — refresh the page and try again.'
        );
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=disconnect`,
        {
          method: 'DELETE',
          headers: authHeader,
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok || data.error) {
        setFirefliesActionError(
          data.error ||
            `Fireflies could not be disconnected (${res.status}).`
        );
        return;
      }

      setApiKeyInput('');
      setSecretRevealed(false);
      setCopiedUrl(false);
      setCopiedSecret(false);

      // Re-read the server rather than trusting local React state.
      await checkFirefliesConnection();
    } catch (error) {
      console.error('Settings: Fireflies disconnect failed:', error);
      setFirefliesActionError(
        'Network error disconnecting Fireflies. The connection was not assumed to be removed.'
      );
    } finally {
      setDisconnectingFireflies(false);
    }
  }

  async function handleRevalidateFireflies() {
    setRevalidating(true);
    setFirefliesActionError(null);

    try {
      const authHeader = await firefliesAuthHeader();

      if (!authHeader) {
        setFirefliesActionError(
          'Your session expired — refresh the page and try again.'
        );
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=revalidate`,
        {
          method: 'POST',
          headers: authHeader,
        }
      );

      const data = await readJsonResponse(res);

      if (!res.ok || data.error || data.ok === false) {
        setFirefliesActionError(
          data.error ||
            `Fireflies revalidation failed (${res.status}).`
        );
      }

      await checkFirefliesConnection();
    } catch (error) {
      console.error('Settings: Fireflies revalidation failed:', error);
      setFirefliesActionError(
        'Network error rechecking Fireflies. Please try again.'
      );
    } finally {
      setRevalidating(false);
    }
  }

  async function copyWebhookUrl() {
    if (!fireflies?.webhook_url) return;

    try {
      await navigator.clipboard.writeText(fireflies.webhook_url);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setFirefliesActionError(
        'Could not copy the webhook URL. Select and copy it manually.'
      );
    }
  }

  async function copyWebhookSecret() {
    if (!fireflies?.webhook_secret) return;

    try {
      await navigator.clipboard.writeText(fireflies.webhook_secret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setFirefliesActionError(
        'Could not copy the webhook secret. Select and copy it manually.'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Profile save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!user || !isDirty) return;

    setSaving(true);
    setSaveError(false);

    const normalized = {
      name: name.trim(),
      whatYouSell: whatYouSell.trim(),
      whoYouAre: whoYouAre.trim(),
    };

    const { error } = await supabase
      .from('profiles')
      .update({
        name: normalized.name || null,
        what_you_sell: normalized.whatYouSell || null,
        who_you_are: normalized.whoYouAre || null,
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      console.error('Settings: profile save failed:', error);
      setSaveError(true);
      window.setTimeout(() => setSaveError(false), 3000);
      return;
    }

    setName(normalized.name);
    setWhatYouSell(normalized.whatYouSell);
    setWhoYouAre(normalized.whoYouAre);
    setInitialValues(normalized);

    void refetchProfile();

    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  function discardChanges() {
    setName(initialValues.name);
    setWhatYouSell(initialValues.whatYouSell);
    setWhoYouAre(initialValues.whoYouAre);
  }

  const integrationsNeedsAttention =
    fireflies?.status === 'invalid' ||
    fireflies?.status === 'pending';

  return (
    <div className="animate-fade-in">
      <div className="-mx-4 md:hidden">
        <TopBar title="Settings" />
      </div>

      <div className="mb-6 md:mb-8 hidden md:block">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
          Settings
        </h1>
        <p className="text-textSecondary text-sm">
          Manage your account and integrations.
        </p>
      </div>

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
              ? 'Calendar connected successfully.'
              : calendarErrorMessage ||
                'Something went wrong connecting your calendar. Please try again.'}
          </span>
        </div>
      )}

      <div className="space-y-6 pb-28 md:pb-24">
        {/* Profile */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
            Profile
          </h2>

          <div className="card p-5 md:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">
                  Name
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">
                  Role
                </label>

                <select
                  value={whoYouAre}
                  onChange={(e) => setWhoYouAre(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select your role</option>
                  <option value="founder">
                    Founder — running sales at an early stage company
                  </option>
                  <option value="ae">
                    Account Executive — full-cycle AE managing pipeline
                  </option>
                  <option value="consultant">
                    Consultant or Agency — selling services
                  </option>
                  <option value="freelancer">
                    Freelancer — winning independent client work
                  </option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Email
              </label>

              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input-field opacity-50 cursor-not-allowed sm:max-w-xs"
              />
            </div>
          </div>
        </section>

        {/* Selling context */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
            Selling Context
          </h2>

          <div className="card p-5 md:p-6">
            <p className="text-textMuted text-xs mb-4">
              Kairo uses this to frame deal reviews more accurately for your
              specific situation.
            </p>

            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              What are you selling?
            </label>

            <textarea
              value={whatYouSell}
              onChange={(e) => setWhatYouSell(e.target.value)}
              placeholder="e.g. SaaS product for HR teams, B2B consulting for fintech companies, marketing agency services..."
              className="input-field min-h-32 md:min-h-36 resize-none"
            />

            <p className="text-textMuted text-xs mt-1.5">
              Be specific — the more context, the sharper the analysis.
            </p>
          </div>
        </section>

        {/* Integrations */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
            Integrations
          </h2>

          <CollapsibleSection
            title="Calendar & Fireflies"
            defaultOpen={integrationsNeedsAttention}
            accent={integrationsNeedsAttention ? 'amber' : 'default'}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start pt-4">
              {/* Calendar */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-textPrimary">
                    Calendar
                  </h3>
                </div>

                <p className="text-textMuted text-xs mb-4">
                  Connect your calendar so upcoming meetings show up in your
                  Inbox — assign them to a deal before the call happens, and
                  Kairo reviews the call automatically once it&apos;s done.
                </p>

                {checkingCalendar ? (
                  <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse" />
                ) : calendarConnected ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-medium">
                        Google Calendar connected
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnectCalendar}
                      disabled={disconnectingCalendar}
                      className="text-xs text-textMuted hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {disconnectingCalendar
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    loading={connectingCalendar}
                    disabled={connectingCalendar}
                    onClick={handleConnectCalendar}
                  >
                    <Calendar className="w-4 h-4" />
                    Connect Google Calendar
                  </Button>
                )}
              </div>

              {/* Fireflies */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-textPrimary">
                    Fireflies
                  </h3>
                </div>

                <p className="text-textMuted text-xs mb-4">
                  Connect your Fireflies account so calls are transcribed and
                  reviewed automatically once the meeting happens.
                </p>

                {checkingFireflies ? (
                  <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse" />
                ) : fireflies?.connected ? (
                  <div className="space-y-4">
                    {/* Invalid connection */}
                    {fireflies.status === 'invalid' ? (
                      <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />

                        <div className="flex-1 min-w-0">
                          <p className="text-red-400 text-xs font-medium">
                            Fireflies rejected the stored key
                            {fireflies.email
                              ? ` for ${fireflies.email}`
                              : ''}
                            .
                          </p>

                          {fireflies.last_error && (
                            <p className="text-textMuted text-xs mt-0.5">
                              {fireflies.last_error}
                            </p>
                          )}

                          <p className="text-textMuted text-xs mt-1.5">
                            Reconnect with a valid key, or disconnect this
                            connection completely.
                          </p>

                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <button
                              type="button"
                              onClick={handleDisconnectFireflies}
                              disabled={disconnectingFireflies}
                              className="text-xs text-textMuted hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              {disconnectingFireflies
                                ? 'Disconnecting…'
                                : 'Disconnect'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Normal connected state */
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />

                          <span className="text-emerald-400 text-xs font-medium truncate">
                            Connected
                            {fireflies.email
                              ? ` as ${fireflies.email}`
                              : ''}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={handleDisconnectFireflies}
                          disabled={disconnectingFireflies}
                          className="text-xs text-textMuted hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                        >
                          {disconnectingFireflies
                            ? 'Disconnecting…'
                            : 'Disconnect'}
                        </button>
                      </div>
                    )}

                    {firefliesActionError && (
                      <p className="text-red-400 text-xs flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{firefliesActionError}</span>
                      </p>
                    )}

                    {fireflies.status !== 'invalid' && (
                      <button
                        type="button"
                        onClick={handleRevalidateFireflies}
                        disabled={revalidating}
                        className="flex items-center gap-1.5 text-xs text-textMuted hover:text-textSecondary transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${
                            revalidating ? 'animate-spin' : ''
                          }`}
                        />

                        {revalidating
                          ? 'Checking…'
                          : 'Recheck connection'}
                      </button>
                    )}

                    {/* Reconnect invalid Fireflies key */}
                    {fireflies.status === 'invalid' && (
                      <form
                        onSubmit={handleConnectFireflies}
                        className="space-y-2"
                      >
                        <label className="block text-xs font-medium text-textSecondary">
                          Fireflies API key
                        </label>

                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) =>
                              setApiKeyInput(e.target.value)
                            }
                            placeholder="Paste your Fireflies API key"
                            className="input-field font-mono text-xs"
                            autoComplete="off"
                          />

                          <Button
                            type="submit"
                            variant="secondary"
                            loading={connectingFireflies}
                            className="flex-shrink-0"
                          >
                            Reconnect
                          </Button>
                        </div>

                        {firefliesFormError && (
                          <p className="text-red-400 text-xs flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            {firefliesFormError}
                          </p>
                        )}
                      </form>
                    )}

                    {fireflies.status === 'pending' && (
                      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                        <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />

                        <p className="text-amber-400 text-xs">
                          Waiting for the first call from Fireflies. Follow
                          the setup steps below — this banner clears
                          automatically once a webhook comes through.
                        </p>
                      </div>
                    )}

                    {fireflies.webhook_url && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-textSecondary mb-1.5">
                            Webhook URL
                          </label>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={fireflies.webhook_url}
                              readOnly
                              className="input-field font-mono text-xs"
                              onFocus={(e) => e.target.select()}
                            />

                            <button
                              type="button"
                              onClick={() => void copyWebhookUrl()}
                              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                              aria-label="Copy webhook URL"
                            >
                              {copiedUrl ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {fireflies.webhook_secret && (
                          <div>
                            <label className="block text-xs font-medium text-textSecondary mb-1.5">
                              Webhook secret
                            </label>

                            <div className="flex items-center gap-2">
                              <input
                                type={secretRevealed ? 'text' : 'password'}
                                value={fireflies.webhook_secret}
                                readOnly
                                className="input-field font-mono text-xs"
                                onFocus={(e) => e.target.select()}
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  setSecretRevealed((revealed) => !revealed)
                                }
                                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                                aria-label={
                                  secretRevealed
                                    ? 'Hide secret'
                                    : 'Reveal secret'
                                }
                              >
                                {secretRevealed ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => void copyWebhookSecret()}
                                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                                aria-label="Copy webhook secret"
                              >
                                {copiedSecret ? (
                                  <Check className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            <p className="text-textMuted text-xs mt-1.5">
                              This is shown only until your first call comes
                              through — copy it now, you won&apos;t be able to
                              view it again later.
                            </p>
                          </div>
                        )}

                        <div className="bg-surfaceHigh border border-border rounded-lg p-4 space-y-2">
                          <p className="text-textPrimary text-xs font-semibold">
                            Setup steps
                          </p>

                          <ol className="text-textSecondary text-xs leading-relaxed list-decimal list-inside space-y-1">
                            <li>
                              Log into your Fireflies account and go to{' '}
                              <span className="font-medium text-textPrimary">
                                Settings → Developer Settings
                              </span>
                              .
                            </li>

                            <li>
                              Find the{' '}
                              <span className="font-medium text-textPrimary">
                                Webhook
                              </span>{' '}
                              section and click Configure.
                            </li>

                            <li>
                              Paste the{' '}
                              <span className="font-medium text-textPrimary">
                                Webhook URL
                              </span>{' '}
                              above into the URL field.
                            </li>

                            <li>
                              Paste the{' '}
                              <span className="font-medium text-textPrimary">
                                Webhook secret
                              </span>{' '}
                              above into the secret key field. Do not click
                              Fireflies&apos; generate button or use a
                              different secret.
                            </li>

                            <li>
                              Under events to send, select{' '}
                              <span className="font-medium text-textPrimary">
                                Transcription Completed
                              </span>
                              .
                            </li>

                            <li>
                              Click Save. New calls will now be reviewed
                              automatically once Fireflies finishes
                              processing them.
                            </li>
                          </ol>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={handleConnectFireflies}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-medium text-textSecondary">
                      Fireflies API key
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Paste your Fireflies API key"
                        className="input-field font-mono text-xs"
                        autoComplete="off"
                      />

                      <Button
                        type="submit"
                        variant="secondary"
                        loading={connectingFireflies}
                        className="flex-shrink-0"
                      >
                        Connect
                      </Button>
                    </div>

                    {firefliesFormError && (
                      <p className="text-red-400 text-xs flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {firefliesFormError}
                      </p>
                    )}

                    {firefliesActionError && (
                      <p className="text-red-400 text-xs flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{firefliesActionError}</span>
                      </p>
                    )}

                    <p className="text-textMuted text-xs">
                      Find your API key in Fireflies under{' '}
                      <span className="font-medium text-textSecondary">
                        Settings → Developer Settings
                      </span>
                      . Kairo verifies it before saving.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </section>

        {/* Plan */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
            Plan
          </h2>

          <div
            className={`card p-5 md:p-6 transition-shadow duration-500 ${
              highlightPlan
                ? 'ring-2 ring-primary/50 shadow-purple-glow-sm'
                : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-textPrimary">
                Subscription
              </h3>
            </div>

            {subscriptionLoading ? (
              <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse mt-4" />
            ) : !subscription ? (
              <p className="text-textMuted text-xs mt-4">
                Couldn&apos;t load your subscription status. Refresh the page,
                or reach out if this persists.
              </p>
            ) : (
              <div className="space-y-4 mt-4">
                {subscription.status === 'trialing' && (
                  <div className="flex items-start gap-2 bg-primary/8 border border-primary/20 rounded-lg px-4 py-3">
                    <Clock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />

                    <div className="flex-1 min-w-0">
                      <p className="text-textPrimary text-xs font-medium">
                        {trialDaysLeft === 0
                          ? 'Your trial ends today'
                          : `${trialDaysLeft} day${
                              trialDaysLeft === 1 ? '' : 's'
                            } left in your trial`}
                      </p>

                      <p className="text-textSecondary text-xs mt-0.5">
                        Trial ends {formatDate(subscription.trial_end)}. You
                        can view everything in Kairo after that — adding new
                        deals, calls, and meetings pauses until you upgrade.
                      </p>
                    </div>
                  </div>
                )}

                {subscription.status === 'active' && (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />

                    <span className="text-emerald-400 text-xs font-medium">
                      Active
                      {subscription.current_period_end
                        ? ` — renews ${formatDate(
                            subscription.current_period_end
                          )}`
                        : ''}
                    </span>
                  </div>
                )}

                {isExpired && (
                  <div className="flex items-center justify-between gap-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                    <p className="text-textPrimary text-xs font-medium">
                      Your access has expired. Upgrade to continue using Kairo.
                    </p>

                    <a
                      href={`mailto:jasirwrites@gmail.com?subject=${encodeURIComponent(
                        'Upgrading my Kairo plan'
                      )}&body=${encodeURIComponent(
                        `Hi, I'd like to upgrade my Kairo account (${
                          profile?.email ?? ''
                        }) to a paid plan.`
                      )}`}
                      className="inline-flex items-center justify-center flex-shrink-0 font-medium rounded-lg transition-all duration-200 active:scale-95 text-xs px-4 py-2 bg-primary hover:bg-primaryLight text-white hover:shadow-purple-glow"
                    >
                      Upgrade
                    </a>
                  </div>
                )}

                {subscription.status === 'past_due' && (
                  <div className="flex items-center justify-between gap-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                    <p className="text-textPrimary text-xs font-medium">
                      Your subscription payment is past due.
                    </p>

                    <a
                      href={`mailto:jasirwrites@gmail.com?subject=${encodeURIComponent(
                        'Kairo subscription payment'
                      )}&body=${encodeURIComponent(
                        `Hi, I'd like to resolve the payment issue on my Kairo account (${
                          profile?.email ?? ''
                        }).`
                      )}`}
                      className="inline-flex items-center justify-center flex-shrink-0 font-medium rounded-lg transition-all duration-200 active:scale-95 text-xs px-4 py-2 bg-primary hover:bg-primaryLight text-white hover:shadow-purple-glow"
                    >
                      Get help
                    </a>
                  </div>
                )}

                {subscription.status === 'canceled' && (
                  <div className="flex items-center justify-between gap-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                    <p className="text-textPrimary text-xs font-medium">
                      Your subscription is canceled.
                    </p>

                    <a
                      href={`mailto:jasirwrites@gmail.com?subject=${encodeURIComponent(
                        'Reactivate my Kairo plan'
                      )}&body=${encodeURIComponent(
                        `Hi, I'd like to reactivate my Kairo account (${
                          profile?.email ?? ''
                        }).`
                      )}`}
                      className="inline-flex items-center justify-center flex-shrink-0 font-medium rounded-lg transition-all duration-200 active:scale-95 text-xs px-4 py-2 bg-primary hover:bg-primaryLight text-white hover:shadow-purple-glow"
                    >
                      Get help
                    </a>
                  </div>
                )}

                {canWrite && subscription.status === 'trialing' && (
                  <p className="text-textMuted text-xs">
                    Ready to upgrade early?{' '}
                    <a
                      href={`mailto:jasirwrites@gmail.com?subject=${encodeURIComponent(
                        'Upgrading my Kairo plan'
                      )}&body=${encodeURIComponent(
                        `Hi, I'd like to upgrade my Kairo account (${
                          profile?.email ?? ''
                        }) to a paid plan.`
                      )}`}
                      className="text-primary hover:text-white transition-colors font-medium"
                    >
                      Get in touch
                    </a>
                    .
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">
            Account
          </h2>

          <div className="card px-5 md:px-6 py-3.5 flex items-center justify-between">
            <span className="text-xs text-textMuted">
              Signed in as {profile?.email}
            </span>

            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs font-medium text-textSecondary hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400/70 mb-3">
            Danger Zone
          </h2>

          <div className="card border-red-500/20 px-5 md:px-6 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-red-400 text-xs font-medium">
                Delete account
              </p>

              <p className="text-textMuted text-xs mt-0.5">
                Permanently deletes every deal, call, and transcript. This
                cannot be undone.
              </p>
            </div>

            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setDeleteModalOpen(true)}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Delete Account
            </Button>
          </div>
        </section>
      </div>

      <DeleteAccountModal
        open={deleteModalOpen}
        email={profile?.email || user?.email || ''}
        onClose={() => setDeleteModalOpen(false)}
      />

      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-8 md:bottom-8 z-20 pb-safe-b md:pb-0">
          <div className="mx-4 mb-4 md:mx-0 md:mb-0 flex items-center justify-between md:justify-end gap-3 bg-surface border border-border rounded-xl shadow-card px-4 py-3 md:px-5">
            <span className="text-xs text-textSecondary md:hidden">
              Unsaved changes
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardChanges}
                className="text-xs font-medium text-textMuted hover:text-textSecondary transition-colors px-2"
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
                {saveError ? 'Save failed — retry' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {justSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-20 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg px-4 py-2.5 shadow-card">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Saved
        </div>
      )}
    </div>
  );
}