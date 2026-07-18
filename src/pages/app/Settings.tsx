import React, { useState } from 'react';
import { Copy, Check, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/layout/TopBar';

export function Settings() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = user
    ? `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/fireflies-webhook?user_id=${user.id}`
    : '';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    await supabase.from('profiles').update({
      name: name.trim(),
      ...(whatYouSell.trim() && { what_you_sell: whatYouSell.trim() }),
      ...(whoYouAre.trim() && { who_you_are: whoYouAre.trim() }),
    }).eq('id', user.id);

    setSaved(true);
    setLoading(false);
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
        <p className="text-textSecondary text-sm">Manage your account and selling context.</p>
      </div>

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
          </div>
        </div>

        {/* Selling Context */}
        <div className="card p-4 md:p-6">
          <h2 className="text-sm font-semibold text-textPrimary mb-1">Selling Context</h2>
          <p className="text-textMuted text-xs mb-4">
            Kairo uses this to frame deal reviews more accurately for your specific situation.
          </p>
          <div className="space-y-4">
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
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Who are you?</label>
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

        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="lg"
          variant={saved ? 'secondary' : 'primary'}
        >
          {saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      </form>

      {/* Fireflies Integration */}
      <div className="card p-4 md:p-6 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-textPrimary">Fireflies Integration</h2>
        </div>
        <p className="text-textMuted text-xs mb-4">
          Connect Fireflies so new call transcripts land automatically in your Inbox — no manual pasting.
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
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="bg-surfaceHigh border border-border rounded-lg p-4 space-y-2">
          <p className="text-textPrimary text-xs font-semibold">Setup steps</p>
          <ol className="text-textSecondary text-xs leading-relaxed list-decimal list-inside space-y-1">
            <li>Log into your Fireflies account and go to <span className="font-medium">Settings → Developer Settings</span>.</li>
            <li>Find the <span className="font-medium">Webhook</span> section and click Configure.</li>
            <li>Paste the URL above into the <span className="font-medium">Webhook URL</span> field.</li>
            <li>In the secret key field, type in the shared secret exactly as given to you — do not click "generate," since that creates a different secret Kairo won't recognize.</li>
            <li>Under events to send, select <span className="font-medium">Transcription Completed</span>.</li>
            <li>Click Save. New calls will now appear automatically in your Inbox once Fireflies finishes processing them.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}