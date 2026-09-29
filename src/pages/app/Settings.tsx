import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LogOut,
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const calendarParam = searchParams.get('calendar');

    if (calendarParam === 'connected') {
      setCalendarBanner('connected');
      setCalendarErrorMessage('');
      void checkCalendarConnection();

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
            apikey: process.env.REACT_APP_SUPABASE_ANON_KEY!,
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
            apikey: process.env.REACT_APP_SUPABASE_ANON_KEY!,
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
            title="Google Calendar"
            defaultOpen={false}
            accent="default"
          >
            <div className="pt-4 max-w-xl">
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