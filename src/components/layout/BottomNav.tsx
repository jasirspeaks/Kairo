import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShieldAlert, FolderOpen, Inbox, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

const TABS = [
  { path: '/app/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/app/risk-center', label: 'Risks', icon: ShieldAlert },
  { path: '/app/new', label: '', icon: Plus, isFab: true },
  { path: '/app/workspace', label: 'Deals', icon: FolderOpen },
  { path: '/app/inbox', label: 'Inbox', icon: Inbox },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  function isActive(path: string) {
    if (path === '/app/workspace') return location.pathname.startsWith('/app/workspace');
    return location.pathname === path;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border shadow-nav
                 pb-safe-b md:hidden"
    >
      <div className="flex items-stretch justify-between px-2 h-nav relative">
        {TABS.map(({ path, label, icon: Icon, isFab }) => {
          if (isFab) {
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="relative -top-5 flex-shrink-0 self-center"
                aria-label="New Deal"
              >
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-purple-glow active:scale-95 transition-transform">
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </button>
            );
          }

          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] py-1"
            >
              <Icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-textMuted')} />
              <span className={cn('text-[10px] font-medium', active ? 'text-primary' : 'text-textMuted')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}