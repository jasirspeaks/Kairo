import React from 'react';
import { Bell, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { NotificationPreferences } from '@kairo/core';

interface NotificationsSectionProps {
  notificationPrefs: NotificationPreferences;
  setNotificationPrefs: (prefs: NotificationPreferences) => void;
}

export function NotificationsSection({
  notificationPrefs,
  setNotificationPrefs,
}: NotificationsSectionProps) {
  const toggleItem = (key: keyof NotificationPreferences) => {
    setNotificationPrefs({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    });
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 md:p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-textPrimary">Deal Intelligence Alerts</h3>
          </div>
          <p className="text-textMuted text-xs">
            Configure how and when Kairo notifies you about qualification state changes and newly parsed call evidence.
          </p>
        </div>

        <div className="space-y-4 pt-1">
          {/* Review Ready */}
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-surfaceHigh border border-border">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-textPrimary">Call Review Ready</p>
                <p className="text-[11px] text-textMuted mt-0.5 leading-relaxed">
                  Trigger an immediate toast and desktop/in-app alert as soon as Gemini finishes transcribing and scoring your call against the 5 pillars.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={notificationPrefs.notify_review_ready}
                onChange={() => toggleItem('notify_review_ready')}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Deal at Risk Escalation */}
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-surfaceHigh border border-border">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-textPrimary">Deal At Risk Escalation</p>
                <p className="text-[11px] text-textMuted mt-0.5 leading-relaxed">
                  Flag active deals that regress into Critical or At Risk status, or when high-priority risks remain unaddressed across multiple consecutive calls.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={notificationPrefs.notify_deal_at_risk}
                onChange={() => toggleItem('notify_deal_at_risk')}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Pre-Call Intelligence Nudge */}
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-surfaceHigh border border-border">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-glow flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-textPrimary">Pre-Call Unknowns Briefing</p>
                <p className="text-[11px] text-textMuted mt-0.5 leading-relaxed">
                  Receive a prompt 15 minutes before scheduled calls highlighting missing qualification pillars and recommended discovery questions to ask.
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={notificationPrefs.notify_pre_meeting}
                onChange={() => toggleItem('notify_pre_meeting')}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
