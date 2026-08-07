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
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/layout/TopBar';

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
  const [searchParams, setSearchParams] = useSearchParams();

  // --- Profile ---
  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // Hydrate the form from the loaded profile. Profile can arrive after
  // first render (it's fetched async in useAuth), so this needs to react
  // to profile changes, not just run once on mount.
  useEffect(() => {
    if (!profile) return;
    setName(profile.name || '');
    setWhatYouSell(profile.what_you_sell || '');
    setWhoYouAre(profile.who_you_are || '');
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

  // --- Profile save ---

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setSaveError(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim() || null,
        what_you_sell: whatYouSell.trim() || null,
        who_you_are: whoYouAre.trim() || null,
      })
      .eq('id', user.id);

    setLoading(false);

    if (error) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
      return;
    }

    refetchProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="animate-fade-in max-w-lg">
      <div className="-mx-4 md:hidden">
        <TopBar title="Settings" />
      </div>

      <div className="mb-6 md:mb-8 hidden md:block">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">Settings</h1>
        <p className="text-textSecondary text-sm">Manage your account and integrations.</p>
      </div>

      {calendarBanner && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 mb-5 text-xs font-medium border ${
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

      <form onSubmit={handleSave} className="space-y-5 mt-4 md:mt-0">
        {/* Profile */}
        <div className="card p-4 md:p-6">
          <h2 className="text-sm font-semibold text-textPrimary mb-4">Profile</h2>
          <div className="space-y-4">
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
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input-field opacity-50 cursor-not-allowed"
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
        </div>

        {/* Selling Context */}
        <div className="card p-4 md:p-6">
          <h2 className="text-sm font-semibold text-textPrimary mb-1">Selling Context</h2>
          <p className="text-textMuted text-xs mb-4">
            Kairo uses this to frame deal reviews more accurately for your specific situation.
          </p>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">What are you selling?</label>
            <textarea
              value={whatYouSell}
              onChange={e => setWhatYouSell(e.target.value)}
              placeholder="e.g. SaaS product for HR teams, B2B consulting for fintech companies, marketing agency services..."
              className="input-field min-h-20 resize-none"
            />
            <p className="text-textMuted text-xs mt-1.5">Be specific — the more context, the sharper the analysis.</p>
          </div>
        </div>

        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="lg"
          variant={saveError ? 'danger' : saved ? 'secondary' : 'primary'}
        >
          {saveError ? 'Save failed — try again' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      </form>

      {/* Calendar Integration */}
      <div className="card p-4 md:p-6 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Calendar</h2>
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
            <Button type="button" variant="secondary" className="w-full">
              <Calendar className="w-4 h-4" />
              Connect Google Calendar
            </Button>
          </a>
        )}
      </div>

      {/* Fireflies Integration */}
      <div className="card p-4 md:p-6 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Fireflies Integration</h2>
        </div>
        <p className="text-textMuted text-xs mb-4">
          Connect your Fireflies account so calls are transcribed and reviewed automatically once the meeting happens.
        </p>

        {checkingFireflies ? (
          <div className="h-10 bg-surfaceHigh rounded-lg animate-pulse" />
        ) : fireflies?.connected ? (
          <div className="space-y-4">
            {/* Connection status */}
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

            {/* Reconnect form — always available, required if invalid */}
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

            {/* Waiting for first delivery — secret + URL still need to be pasted into Fireflies */}
            {fireflies.status === 'pending' && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-400 text-xs">
                  Waiting for the first call from Fireflies. Follow the setup steps below — this banner clears automatically once a webhook comes through.
                </p>
              </div>
            )}

            {/* Webhook URL + secret + setup steps */}
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

                {/* webhook_secret is only ever sent by the backend while
                    setup is unconfirmed (see shouldExposeSecret in
                    fireflies-connect) — once a delivery has succeeded once,
                    this field is simply absent and there's nothing to
                    re-paste, so the block disappears entirely. */}
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

      {/* Sign Out */}
      <div className="card p-4 md:p-6 mt-5">
        <button
          type="button"
          onClick={signOut}
          className="flex items-center justify-center gap-2 w-full text-sm font-medium text-textSecondary hover:text-red-400 transition-colors py-1"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}