import React from 'react';
import {
  User,
  Mic,
  Calendar,
  Bell,
  Shield,
  CreditCard,
  UserCheck,
} from 'lucide-react';

export type SettingsTabId =
  | 'context'
  | 'audio'
  | 'integrations'
  | 'notifications'
  | 'privacy'
  | 'billing'
  | 'account';

interface TabItem {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const TABS: TabItem[] = [
  { id: 'context', label: 'Seller Context & AI', icon: User },
  { id: 'audio', label: 'Audio & Capture', icon: Mic },
  { id: 'integrations', label: 'Integrations', icon: Calendar },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Security & 48h Retention', icon: Shield },
  { id: 'billing', label: 'Subscription & Plan', icon: CreditCard },
  { id: 'account', label: 'Account & Data', icon: UserCheck },
];

interface SettingsNavigationProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
}

export function SettingsNavigation({
  activeTab,
  onSelectTab,
}: SettingsNavigationProps) {
  return (
    <>
      {/* Mobile Horizontal Pill Scroll */}
      <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-4 -mx-1 px-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-purple-glow-sm'
                  : 'bg-surface border border-border text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Desktop Vertical Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0 space-y-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                isActive
                  ? 'bg-primary/15 text-primary border border-primary/30 shadow-purple-glow-sm'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-textMuted'}`} />
              <span className="flex-1 truncate">{tab.label}</span>
            </button>
          );
        })}
      </aside>
    </>
  );
}
