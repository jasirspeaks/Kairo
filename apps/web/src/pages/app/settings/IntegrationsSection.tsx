import React from 'react';
import { Calendar, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface IntegrationsSectionProps {
  calendarConnected: boolean;
  checkingCalendar: boolean;
  connectingCalendar: boolean;
  disconnectingCalendar: boolean;
  onConnectCalendar: () => void;
  onDisconnectCalendar: () => void;
  onRefreshCalendar: () => void;
}

export function IntegrationsSection({
  calendarConnected,
  checkingCalendar,
  connectingCalendar,
  disconnectingCalendar,
  onConnectCalendar,
  onDisconnectCalendar,
  onRefreshCalendar,
}: IntegrationsSectionProps) {
  return (
    <div className="space-y-6">
      {/* Google Calendar Card */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-textPrimary">Google Calendar</h3>
          </div>
          {calendarConnected && (
            <button
              type="button"
              onClick={onRefreshCalendar}
              disabled={checkingCalendar}
              className="text-xs text-textMuted hover:text-textPrimary flex items-center gap-1 transition-colors"
              title="Refresh calendar sync"
            >
              <RefreshCw className={`w-3 h-3 ${checkingCalendar ? 'animate-spin' : ''}`} />
              Sync
            </button>
          )}
        </div>

        <p className="text-textSecondary text-xs leading-relaxed">
          Sync upcoming sales meetings directly into your Kairo Inbox. Assign calls to deals before they start, and let Kairo trigger automatic qualification reviews immediately when the call concludes.
        </p>

        {checkingCalendar ? (
          <div className="h-12 bg-surfaceHigh rounded-lg animate-pulse" />
        ) : calendarConnected ? (
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-400">
                  Connected & Actively Syncing
                </p>
                <p className="text-[11px] text-emerald-400/80">
                  Meetings sync automatically every 10 minutes.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={disconnectingCalendar}
              disabled={disconnectingCalendar}
              onClick={onDisconnectCalendar}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-surfaceHigh border border-border">
            <div>
              <p className="text-xs font-medium text-textPrimary">Not connected</p>
              <p className="text-[11px] text-textMuted">
                Connect your work Google account to view upcoming pipeline meetings.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={connectingCalendar}
              disabled={connectingCalendar}
              onClick={onConnectCalendar}
              className="sm:flex-shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" />
              Connect Google Calendar
            </Button>
          </div>
        )}
      </div>

      {/* Microsoft 365 / Outlook (Roadmap) */}
      <div className="card p-5 md:p-6 space-y-3 opacity-80 border-dashed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-textMuted" />
            <h3 className="text-sm font-semibold text-textPrimary">
              Microsoft 365 / Outlook Calendar
            </h3>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-surfaceHigh text-textMuted border border-border">
            Enterprise Roadmap
          </span>
        </div>

        <p className="text-textMuted text-xs leading-relaxed">
          Enterprise Exchange and Office 365 calendar synchronization for Account Executives working in corporate Microsoft environments.
        </p>
      </div>

      {/* CRM Two-Way Sync (Roadmap) */}
      <div className="card p-5 md:p-6 space-y-3 opacity-80 border-dashed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-textMuted" />
            <h3 className="text-sm font-semibold text-textPrimary">
              Salesforce & HubSpot CRM Sync
            </h3>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-surfaceHigh text-textMuted border border-border">
            Coming Soon
          </span>
        </div>

        <p className="text-textMuted text-xs leading-relaxed">
          Bi-directional deal stage mapping, automatic MEDDPICC / 5-Pillar health writeback, and scheduled next action logging directly to your CRM opportunity records.
        </p>
      </div>
    </div>
  );
}
