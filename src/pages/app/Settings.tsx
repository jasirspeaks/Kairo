import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, Zap, Calendar, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/layout/TopBar';

export function Settings() {
  const { user, profile, signOut, refetchProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [name, setName] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [calendarBanner, setCalendarBanner] = useState<'connected' | 'error' | null>(null);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  const webhookUrl = user
    ? `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-webhook?user_id=${user.id}`
    : '';

  const calendarConnectUrl = user
    ? `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/google-calendar-connect?user_id=${user.id}`
    : '';

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

  function copyWebhookUrl() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          Connect Fireflies so call recordings are transcribed and reviewed automatically once the meeting happens.
        </p>

        <label className="block text-xs font-medium text-textSecondary mb-1.5">Your webhook URL</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={webhookUrl}
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
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="bg-surfaceHigh border border-border rounded-lg p-4 space-y-2">
          <p className="text-textPrimary text-xs font-semibold">Setup steps</p>
          <ol className="text-textSecondary text-xs leading-relaxed list-decimal list-inside space-y-1">
            <li>Log into your Fireflies account and go to <span className="font-medium text-textPrimary">Settings → Developer Settings</span>.</li>
            <li>Find the <span className="font-medium text-textPrimary">Webhook</span> section and click Configure.</li>
            <li>Paste the URL above into the <span className="font-medium text-textPrimary">Webhook URL</span> field.</li>
            <li>In the secret key field, type in the shared secret exactly as given to you — do not click "generate," since that creates a different secret Kairo won't recognize.</li>
            <li>Under events to send, select <span className="font-medium text-textPrimary">Transcription Completed</span>.</li>
            <li>Click Save. New calls will now be reviewed automatically once Fireflies finishes processing them.</li>
          </ol>
        </div>
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