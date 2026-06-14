import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

export function Settings() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await supabase.from('profiles').update({ name }).eq('id', user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="animate-fade-in max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Settings</h1>
        <p className="text-textSecondary text-sm">Manage your account and preferences.</p>
      </div>

      <div className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-white mb-4">Profile</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Email</label>
            <input type="email" value={profile?.email || ''} className="input-field opacity-50" disabled />
          </div>
          <Button type="submit" variant={saved ? 'secondary' : 'primary'}>
            {saved ? '✓ Saved' : 'Save Changes'}
          </Button>
        </form>
      </div>
    </div>
  );
}