import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NAV_ITEMS } from '../../config/navItems';

// Same four destinations as the sidebar, with the New Deal FAB inserted
// between Deals and Inbox. Dashboard keeps the shorter "Home" label here
// since space is tighter in the bottom bar.
const TABS = [
  { ...NAV_ITEMS[0], label: 'Home' },
  NAV_ITEMS[1],
  { path: '/app/new', label: '', icon: Plus, isFab: true },
  NAV_ITEMS[2],
  NAV_ITEMS[3],
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  function isActive(path: string) {
    if (path === '/app/deals') return location.pathname.startsWith('/app/deals');
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
                className="flex-1 flex items-center justify-center min-w-[44px]"
                aria-label="New Deal"
              >
                <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shadow-purple-glow-sm active:scale-95 transition-transform duration-150 ease-spring">
                  <Icon className="w-5 h-5 text-white" />
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
              <span
                className={cn(
                  'flex items-center justify-center rounded-full transition-colors duration-150',
                  active ? 'bg-primary w-9 h-7 shadow-purple-glow-sm' : 'w-9 h-7'
                )}
              >
                <Icon className={cn('w-5 h-5', active ? 'text-white' : 'text-textMuted')} />
              </span>
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