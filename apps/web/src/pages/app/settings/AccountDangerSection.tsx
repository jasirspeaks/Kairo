import React from 'react';
import { LogOut, AlertTriangle, UserCheck, ShieldAlert, Laptop, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { isTauriEnvironment } from '@kairo/platform';

interface AccountDangerSectionProps {
  email: string;
  onSignOut: () => void;
  onOpenDeleteModal: () => void;
}

export function AccountDangerSection({
  email,
  onSignOut,
  onOpenDeleteModal,
}: AccountDangerSectionProps) {
  const isDesktop = isTauriEnvironment();

  return (
    <div className="space-y-6">
      {/* Account Info */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-textPrimary">Account Identity</h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-surfaceHigh border border-border">
          <div>
            <span className="text-xs text-textSecondary font-medium">Signed in as</span>
            <p className="text-sm font-semibold text-textPrimary">{email}</p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Desktop App Information if inside Desktop */}
      {isDesktop && (
        <div className="card p-5 md:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-textPrimary">Desktop Application</h3>
          </div>
          <p className="text-xs text-textMuted">
            Running Kairo Desktop with native hardware audio loopback and background calendar watcher.
          </p>
          <div className="flex items-center justify-between pt-1 text-xs text-textSecondary">
            <span>Desktop Channel: <strong>Production Stable</strong></span>
            <span>Client Version: <strong>v0.1.0</strong></span>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="card border-red-500/25 p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <div>
            <p className="text-xs font-semibold text-red-400">Delete Account & Pipeline History</p>
            <p className="text-textMuted text-xs mt-0.5 leading-relaxed">
              Permanently purges your account, all active deals, meeting transcripts, audio files, and intelligence assessments. This action cannot be reversed.
            </p>
          </div>

          <Button
            type="button"
            variant="danger"
            size="sm"
            className="sm:flex-shrink-0"
            onClick={onOpenDeleteModal}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}
