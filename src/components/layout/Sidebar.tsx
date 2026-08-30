import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Plus, FolderOpen, Settings, Inbox
} from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/deals', label: 'Deals', icon: FolderOpen },
  { path: '/app/inbox', label: 'Inbox', icon: Inbox },
  { path: '/app/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  function isActive(path: string) {
    if (path === '/app/deals') {
      return location.pathname.startsWith('/app/deals');
    }
    return location.pathname === path;
  }

  return (
    <aside className="w-64 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-mark.png"
            alt="Kairo"
            className="w-8 h-8 rounded-lg object-contain"
          />
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

      {/* New Deal — accent action, pinned to bottom */}
      <div className="px-3 pb-5 pt-3 border-t border-border">
        <button
          onClick={() => navigate('/app/new')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primaryHover transition-colors duration-200 shadow-purple-glow-sm"
        >
          <Plus className="w-4 h-4" />
          New Deal
        </button>
      </div>
    </aside>
  );
}