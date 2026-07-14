import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Plus, FolderOpen, ShieldAlert, Settings, LogOut, Zap, Inbox
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/inbox', label: 'Inbox', icon: Inbox },
  { path: '/app/new', label: 'New Deal', icon: Plus },
  { path: '/app/workspace', label: 'Deal Workspace', icon: FolderOpen },
  { path: '/app/risk-center', label: 'Risk Center', icon: ShieldAlert },
  { path: '/app/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  function isActive(path: string) {
    if (path === '/app/workspace') {
      return location.pathname.startsWith('/app/workspace');
    }
    return location.pathname === path;
  }

  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-purple-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-textPrimary tracking-tight">Kairo</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left',
                active
                  ? 'text-primary bg-primary/10 border border-primary/20'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh'
              )}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-primary' : '')} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* User + Sign out */}
      <div className="px-4 pb-5 border-t border-border pt-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
            {(profile?.name || profile?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-textPrimary truncate">{profile?.name || 'User'}</p>
            <p className="text-xs text-textMuted truncate">{profile?.email}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-textMuted hover:text-red-500 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}