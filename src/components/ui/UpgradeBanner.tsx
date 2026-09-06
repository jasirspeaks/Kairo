import React from 'react';
import { Lock } from 'lucide-react';

interface UpgradeBannerProps {
  // Short, context-specific reason shown after the shared headline, e.g.
  // "to add a call" or "to schedule a meeting". Keep it a fragment, not
  // a full sentence -- the headline supplies the subject and verb.
  action?: string;
  className?: string;
}

// Shown wherever a write action (New Deal, Add Call, Schedule Next
// Meeting) is disabled because the account is read-only. Deliberately
// does not mention pricing or a specific plan here -- Settings is the
// single place that owns the actual upgrade CTA once payments exist.
export function UpgradeBanner({ action, className = '' }: UpgradeBannerProps) {
  return (
    <div className={`flex items-start gap-2.5 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 ${className}`}>
      <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-textPrimary text-xs font-medium mb-0.5">Your trial has ended</p>
        <p className="text-textSecondary text-xs leading-relaxed">
          You can still view everything in Kairo, but upgrading is needed{action ? ` ${action}` : ' to make changes'}.
        </p>
      </div>
    </div>
  );
}