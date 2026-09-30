import React from 'react';
import {
  Inbox as InboxIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useAuth } from '@kairo/api';

export function InboxView() {
  const { user } = useAuth();

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-textPrimary font-display">
            Action Inbox
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            AI-extracted follow-ups, stakeholder commitments, and risk blockers
          </p>
        </div>
      </div>

      {/* Inbox List */}
      <div className="card p-12 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-surfaceHigh flex items-center justify-center text-textMuted">
          <InboxIcon className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-textPrimary">All caught up!</h3>
        <p className="text-xs text-textMuted max-w-sm">
          No outstanding action items. Review your active deals or record your next sales conversation.
        </p>
      </div>
    </div>
  );
}
