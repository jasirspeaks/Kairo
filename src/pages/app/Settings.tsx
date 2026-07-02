import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

export function Settings() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoYouAre, setWhoYouAre] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="animate-fade-in max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">Settings</h1>
        <p className="text-textSecondary text-sm">Manage your account and selling context.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Profile */}
        <div className="card p-6">
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
        <div className="card p-6">
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
    </div>
  );
}