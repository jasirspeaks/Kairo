import React from 'react';
import {
  User,
  Calendar,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { useAuth, useSubscription } from '@kairo/api';
import { openUrl, getCalendarRedirectUrl } from '@kairo/platform';

export function SettingsView() {
  const { user, profile } = useAuth();
  const { subscription, trialDaysLeft, canWrite } = useSubscription(user?.id);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-textPrimary font-display">
          Settings & Account
        </h1>
        <p className="text-xs text-textSecondary mt-0.5">
          Manage desktop preferences, calendar synchronization, and subscription
        </p>
      </div>

      {/* Account Info */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-textPrimary uppercase tracking-wider">
          <User className="w-4 h-4 text-primary" />
          <span>Profile Information</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-textMuted block mb-1">Full Name</label>
            <p className="font-semibold text-textPrimary bg-surfaceHigh/60 p-2.5 rounded-lg border border-border">
              {profile?.name || 'Not set'}
            </p>
          </div>
          <div>
            <label className="text-textMuted block mb-1">Email Address</label>
            <p className="font-semibold text-textPrimary bg-surfaceHigh/60 p-2.5 rounded-lg border border-border">
              {user?.email || 'Not signed in'}
            </p>
          </div>
        </div>
      </div>

      {/* Calendar Integration */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-textPrimary uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-accent" />
            <span>Google Calendar Sync</span>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-surfaceHigh text-textMuted border border-border">
            OAuth 2.0
          </span>
        </div>
        <p className="text-xs text-textSecondary">
          Connect your Google Calendar to automatically ingest sales meetings and match attendees with deals.
        </p>
        <button
          onClick={() => {
            const url = getCalendarRedirectUrl('desktop');
            openUrl(url);
          }}
          className="btn-secondary text-xs py-2 px-4 flex items-center justify-center gap-2 w-fit"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Connect Google Calendar</span>
        </button>
      </div>

      {/* Subscription */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-textPrimary uppercase tracking-wider">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <span>Subscription & Access</span>
          </div>
          <span
            className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
              canWrite
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            {subscription?.status?.toUpperCase() || (canWrite ? 'ACTIVE TRIAL' : 'INACTIVE')}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-surfaceHigh/60 border border-border text-xs flex items-center justify-between">
          <div>
            <p className="font-semibold text-textPrimary">
              {trialDaysLeft !== null ? `${trialDaysLeft} Days Remaining on Trial` : 'Full Access Active'}
            </p>
            <p className="text-[11px] text-textMuted mt-0.5">
              Access to AI transcription, health scoring, and real-time deal analysis
            </p>
          </div>
          <Shield className="w-5 h-5 text-primary flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
