import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Copy,
  Check,
  Zap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Loader2,
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
  // Only present while setup is unconfirmed -- see shouldExposeSecret()
  // in fireflies-connect. Absence of this field (vs. an empty string)
  // means "already confirmed, nothing to show."
  webhook_secret?: string;
}

export function Settings() {
  const { user, profile, signOut, refetchProfile } = useAuth();
  const { subscription, loading: subscriptionLoading, canWrite, isExpired, trialDaysLeft } = useSubscription(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightPlan, setHighlightPlan] = useState(false);

  // --- Profile / Selling Context ---
  // Both live in the same `profiles` row, so they share one dirty-check
  // and one save call rather than two separate forms with two separate
  // buttons doing the same update.
  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [initialValues, setInitialValues] = useState({ name: '', whatYouSell: '', whoYouAre: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // --- Calendar ---
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [calendarBanner, setCalendarBanner] = useState<'connected' | 'error' | null>(null);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  const calendarConnectUrl = user
    ? `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/google-calendar-connect?user_id=${user.id}`
    : '';

  // --- Fireflies ---
  const [fireflies, setFireflies] = useState<FirefliesConnectionState | null>(null);
  const [checkingFireflies, setCheckingFireflies] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [connectingFireflies, setConnectingFireflies] = useState(false);
  const [firefliesFormError, setFirefliesFormError] = useState<string | null>(null);
  const [disconnectingFireflies, setDisconnectingFireflies] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);

  const isDirty =
    name !== initialValues.name ||
    whatYouSell !== initialValues.whatYouSell ||
    whoYouAre !== initialValues.whoYouAre;

  // Hydrate the form from the loaded profile. Profile can arrive after
  // first render (it's fetched async in useAuth), so this needs to react
  // to profile changes, not just run once on mount.
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
    checkCalendarConnection();
    checkFirefliesConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const calendarParam = searchParams.get('calendar');
    if (calendarParam === 'connected' || calendarParam === 'error') {
      setCalendarBanner(calendarParam);
      if (calendarParam === 'connected') setCalendarConnected(true);
      searchParams.delete('calendar');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => setCalendarBanner(null), 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrives via UpgradeModal's "Upgrade" button (shown when someone
  // clicks a blocked write action anywhere in the app). Briefly
  // highlights the Plan section so it's obvious where to look after
  // landing on Settings.
  useEffect(() => {
    if (searchParams.get('upgrade') === '1') {
      setHighlightPlan(true);
      searchParams.delete('upgrade');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => setHighlightPlan(false), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Calendar handlers ---

  async function checkCalendarConnection() {
    if (!user) return;
    setCheckingCalendar(true);
    const { data } = await supabase
      .from('calendar_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();
    setCalendarConnected(!!data);
    setCheckingCalendar(false);
  }

  async function handleDisconnectCalendar() {
    if (!user) return;
    setDisconnectingCalendar(true);
    await supabase
      .from('calendar_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'google');
    setCalendarConnected(false);
    setDisconnectingCalendar(false);
  }

  // --- Fireflies handlers ---
  // fireflies-connect authenticates the caller itself (via the user's own
  // session JWT, not a service-role/user_id query param like the webhook
  // does), so every call here needs the Authorization header.

  const firefliesAuthHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  async function checkFirefliesConnection() {
    setCheckingFireflies(true);
    try {
      const authHeader = await firefliesAuthHeader();
      if (!authHeader) return;
      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=status`,
        { headers: authHeader }
      );
      const data = await res.json();
      setFireflies(data);
    } catch {
      setFireflies(null);
    } finally {
      setCheckingFireflies(false);
    }
  }

  async function handleConnectFireflies(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setConnectingFireflies(true);
    setFirefliesFormError(null);

    try {
      const authHeader = await firefliesAuthHeader();
      if (!authHeader) {
        setFirefliesFormError('Your session expired — refresh the page and try again.');
        return;
      }
      const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setFirefliesFormError(data.error || 'Could not verify this Fireflies API key.');
        return;
      }

      setApiKeyInput('');
      setSecretRevealed(true); // fresh connect: show the secret by default, they need it right now
      await checkFirefliesConnection();
    } catch {
      setFirefliesFormError('Network error reaching Fireflies. Please try again.');
    } finally {
      setConnectingFireflies(false);
    }
  }

  async function handleDisconnectFireflies() {
    setDisconnectingFireflies(true);
    try {
      const authHeader = await firefliesAuthHeader();
      if (!authHeader) return;
      await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=disconnect`, {
        method: 'DELETE',
        headers: authHeader,
      });
      setFireflies({ connected: false });
    } finally {
      setDisconnectingFireflies(false);
    }
  }

  async function handleRevalidateFireflies() {
    setRevalidating(true);
    try {
      const authHeader = await firefliesAuthHeader();
      if (!authHeader) return;
      await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-connect?action=revalidate`, {
        method: 'POST',
        headers: authHeader,
      });
      await checkFirefliesConnection();
    } finally {
      setRevalidating(false);
    }
  }

  function copyWebhookUrl() {
    if (!fireflies?.webhook_url) return;
    navigator.clipboard.writeText(fireflies.webhook_url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function copyWebhookSecret() {
    if (!fireflies?.webhook_secret) return;
    navigator.clipboard.writeText(fireflies.webhook_secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  // --- Save (Profile + Selling Context together) ---

  async function handleSave() {
    if (!user || !isDirty) return;
    setSaving(true);
    setSaveError(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim() || null,
        what_you_sell: whatYouSell.trim() || null,
        who_you_are: whoYouAre.trim() || null,
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
      return;
    }

    refetchProfile();
    setInitialValues({ name, whatYouSell, whoYouAre });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
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
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">Settings</h1>
        <p className="text-textSecondary text-sm">Manage your account and integrations.</p>
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
          {calendarBanner === 'connected'
            ? 'Calendar connected successfully.'
            : "Something went wrong connecting your calendar. Please try again."}
        </div>
      )}

      {/* One continuous page. No nav chrome, no section switching — each
          zone below uses width in whatever way its own content calls for,
          rather than forcing a uniform card width across unrelated
          content types. Bottom padding clears the sticky save bar and
          (on mobile) the bottom nav. */}
      <div className="space-y-10 pb-28 md:pb-24 max-w-4xl">
        {/* --- Profile --- */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">Profile</h2>
          <div className="card p-5 md:p-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-textSecondary mb-1.5">Role</label>
                <select
                  value={whoYouAre}
                  onChange={e => setWhoYouAre(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select your role</option>
                  <option value="founder">Founder — running sales at an early stage company</option>
                  <option value="ae">Account Executive — full-cycle AE managing pipeline</option>
                  <option value="consultant">Consultant or Agency — selling services</option>
                  <option value="freelancer">Freelancer — winning independent client work</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input-field opacity-50 cursor-not-allowed sm:max-w-xs"
              />
            </div>
          </div>
        </section>

        {/* --- Selling Context --- */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">Selling Context</h2>
          <div className="card p-5 md:p-7">
            <p className="text-textMuted text-xs mb-4">
              Kairo uses this to frame deal reviews more accurately for your specific situation.
            </p>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">What are you selling?</label>
            <textarea
              value={whatYouSell}
              onChange={e => setWhatYouSell(e.target.value)}
              placeholder="e.g. SaaS product for HR teams, B2B consulting for fintech companies, marketing agency services..."
              className="input-field min-h-44 md:min-h-52 resize-none"
            />
            <p className="text-textMuted text-xs mt-1.5">Be specific — the more context, the sharper the analysis.</p>
          </div>
        </section>

        {/* --- Integrations --- */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">Integrations</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Calendar */}
            <div className="card p-5 md:p-7">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-textPrimary">Calendar</h3>
              </div>
              <p className="text-textMuted text-xs mb-4">
                Connect your calendar so upcoming meetings show up in your Inbox — assign them to a deal before the call happens, and Kairo reviews the call automatically once it's done.
              </p>

              {checkingCalendar ? (
                <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse" />
              ) : calendarConnected ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 text-xs font-medium">Google Calendar connected</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectCalendar}
                    disabled={disconnectingCalendar}
                    className="text-xs text-textMuted hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {disconnectingCalendar ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <a href={calendarConnectUrl}>
                  <Button type="button" variant="secondary" className="w-full sm:w-auto">
                    <Calendar className="w-4 h-4" />
                    Connect Google Calendar
                  </Button>
                </a>
              )}
            </div>

            {/* Fireflies */}
            <div className="card p-5 md:p-7">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-textPrimary">Fireflies</h3>
              </div>
              <p className="text-textMuted text-xs mb-4">
                Connect your Fireflies account so calls are transcribed and reviewed automatically once the meeting happens.
              </p>

              {checkingFireflies ? (
                <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse" />
              ) : fireflies?.connected ? (
                <div className="space-y-4">
                  {fireflies.status === 'invalid' ? (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-400 text-xs font-medium">
                          Fireflies rejected the stored key{fireflies.email ? ` for ${fireflies.email}` : ''}.
                        </p>
                        {fireflies.last_error && (
                          <p className="text-textMuted text-xs mt-0.5">{fireflies.last_error}</p>
                        )}
                        <p className="text-textMuted text-xs mt-1.5">
                          Reconnect below with a valid key, or recheck if you've fixed it on Fireflies' side.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-emerald-400 text-xs font-medium truncate">
                          Connected{fireflies.email ? ` as ${fireflies.email}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnectFireflies}
                        disabled={disconnectingFireflies}
                        className="text-xs text-textMuted hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                      >
                        {disconnectingFireflies ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  )}

                  {fireflies.status !== 'invalid' && (
                    <button
                      type="button"
                      onClick={handleRevalidateFireflies}
                      disabled={revalidating}
                      className="flex items-center gap-1.5 text-xs text-textMuted hover:text-textSecondary transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${revalidating ? 'animate-spin' : ''}`} />
                      {revalidating ? 'Checking…' : 'Recheck connection'}
                    </button>
                  )}

                  {fireflies.status === 'invalid' && (
                    <form onSubmit={handleConnectFireflies} className="space-y-2">
                      <label className="block text-xs font-medium text-textSecondary">Fireflies API key</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={e => setApiKeyInput(e.target.value)}
                          placeholder="Paste your Fireflies API key"
                          className="input-field font-mono text-xs"
                          autoComplete="off"
                        />
                        <Button type="submit" variant="secondary" loading={connectingFireflies} className="flex-shrink-0">
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
                        Waiting for the first call from Fireflies. Follow the setup steps below — this banner clears automatically once a webhook comes through.
                      </p>
                    </div>
                  )}

                  {fireflies.webhook_url && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-textSecondary mb-1.5">Webhook URL</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={fireflies.webhook_url}
                            readOnly
                            className="input-field font-mono text-xs"
                            onFocus={e => e.target.select()}
                          />
                          <button
                            type="button"
                            onClick={copyWebhookUrl}
                            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                            aria-label="Copy webhook URL"
                          >
                            {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
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
                              onFocus={e => e.target.select()}
                            />
                            <button
                              type="button"
                              onClick={() => setSecretRevealed(r => !r)}
                              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                              aria-label={secretRevealed ? 'Hide secret' : 'Reveal secret'}
                            >
                              {secretRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={copyWebhookSecret}
                              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-border bg-surfaceHigh hover:border-accent/40 text-textSecondary"
                              aria-label="Copy webhook secret"
                            >
                              {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-textMuted text-xs mt-1.5">
                            This is shown only until your first call comes through — copy it now, you won't be able to view it again later.
                          </p>
                        </div>
                      )}

                      <div className="bg-surfaceHigh border border-border rounded-lg p-4 space-y-2">
                        <p className="text-textPrimary text-xs font-semibold">Setup steps</p>
                        <ol className="text-textSecondary text-xs leading-relaxed list-decimal list-inside space-y-1">
                          <li>Log into your Fireflies account and go to <span className="font-medium text-textPrimary">Settings → Developer Settings</span>.</li>
                          <li>Find the <span className="font-medium text-textPrimary">Webhook</span> section and click Configure.</li>
                          <li>Paste the <span className="font-medium text-textPrimary">Webhook URL</span> above into the URL field.</li>
                          <li>Paste the <span className="font-medium text-textPrimary">Webhook secret</span> above into the secret key field — do not click Fireflies' "generate" button, it will create a different secret Kairo won't recognize and every call will fail with a 401.</li>
                          <li>Under events to send, select <span className="font-medium text-textPrimary">Transcription Completed</span>.</li>
                          <li>Click Save. New calls will now be reviewed automatically once Fireflies finishes processing them.</li>
                        </ol>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handleConnectFireflies} className="space-y-2">
                  <label className="block text-xs font-medium text-textSecondary">Fireflies API key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                      placeholder="Paste your Fireflies API key"
                      className="input-field font-mono text-xs"
                      autoComplete="off"
                    />
                    <Button type="submit" variant="secondary" loading={connectingFireflies} className="flex-shrink-0">
                      {connectingFireflies ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                    </Button>
                  </div>
                  {firefliesFormError && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {firefliesFormError}
                    </p>
                  )}
                  <p className="text-textMuted text-xs">
                    Find your API key in Fireflies under <span className="font-medium text-textSecondary">Settings → Developer Settings</span>. Kairo verifies it before saving.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* --- Plan --- */}
        {/* Status-only for now — no payment gateway connected yet, so
            there's nothing to click through to. Once Stripe is wired up,
            the mailto fallback below gets replaced with a real Checkout
            link/button; the status states themselves don't need to change. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">Plan</h2>
          <div
            className={`card p-5 md:p-7 transition-shadow duration-500 ${
              highlightPlan ? 'ring-2 ring-primary/50 shadow-purple-glow-sm' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-textPrimary">Subscription</h3>
            </div>

            {subscriptionLoading ? (
              <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse mt-4" />
            ) : !subscription ? (
              <p className="text-textMuted text-xs mt-4">
                Couldn't load your subscription status. Refresh the page, or reach out if this persists.
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
                          : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your trial`}
                      </p>
                      <p className="text-textSecondary text-xs mt-0.5">
                        Trial ends {formatDate(subscription.trial_end)}. You can view everything in Kairo after that — adding new deals, calls, and meetings pauses until you upgrade.
                      </p>
                    </div>
                  </div>
                )}

                {subscription.status === 'active' && (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-emerald-400 text-xs font-medium">
                      Active{subscription.current_period_end ? ` — renews ${formatDate(subscription.current_period_end)}` : ''}
                    </span>
                  </div>
                )}

                {(isExpired || subscription.status === 'past_due' || subscription.status === 'canceled') && (
                  <div className="flex items-center justify-between gap-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                    <p className="text-textPrimary text-xs font-medium">
                      Trial ended, upgrade to continue using Kairo.
                    </p>
                    <a
                      href={`mailto:hello@kairoiq.com?subject=${encodeURIComponent('Upgrading my Kairo plan')}&body=${encodeURIComponent(`Hi, I'd like to upgrade my Kairo account (${profile?.email ?? ''}) to a paid plan.`)}`}
                      className="inline-flex items-center justify-center flex-shrink-0 font-medium rounded-lg transition-all duration-200 active:scale-95 text-xs px-4 py-2 bg-primary hover:bg-primaryLight text-white hover:shadow-purple-glow"
                    >
                      Upgrade
                    </a>
                  </div>
                )}

                {canWrite && subscription.status === 'trialing' && (
                  <p className="text-textMuted text-xs">
                    Ready to upgrade early?{' '}
                    <a
                      href={`mailto:hello@kairoiq.com?subject=${encodeURIComponent('Upgrading my Kairo plan')}&body=${encodeURIComponent(`Hi, I'd like to upgrade my Kairo account (${profile?.email ?? ''}) to a paid plan.`)}`}
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

        {/* --- Account --- */}
        {/* Deliberately the quietest section on the page — least-used
            action, lowest visual weight, tucked at the very bottom. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-textMuted mb-3">Account</h2>
          <div className="card px-5 md:px-7 py-3.5 flex items-center justify-between">
            <span className="text-xs text-textMuted">Signed in as {profile?.email}</span>
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
      </div>

      {/* Unified save bar — appears only while Profile or Selling Context
          have unsaved edits. Fixed above the mobile bottom nav / safe
          area; sticky to the bottom-right on desktop. Covers both
          sections since they write to the same profile row. */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-8 md:bottom-8 z-20 pb-safe-b md:pb-0">
          <div className="mx-4 mb-4 md:mx-0 md:mb-0 flex items-center justify-between md:justify-end gap-3 bg-surface border border-border rounded-xl shadow-card px-4 py-3 md:px-5">
            <span className="text-xs text-textSecondary md:hidden">Unsaved changes</span>
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

      {/* Brief success confirmation, independent of the dirty-state bar
          (which disappears the instant isDirty flips false on save). */}
      {justSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-20 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg px-4 py-2.5 shadow-card">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Saved
        </div>
      )}
    </div>
  );
}