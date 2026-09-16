import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useInboxCount } from '../../hooks/useInboxCount';
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
  const { user } = useAuth();
  const inboxCount = useInboxCount(user?.id);

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
          const showBadge = path === '/app/inbox' && inboxCount > 0;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] py-1"
            >
              <span
                className={cn(
                  'relative flex items-center justify-center rounded-full transition-colors duration-150',
                  active ? 'bg-primary w-9 h-7 shadow-purple-glow-sm' : 'w-9 h-7'
                )}
              >
                <Icon className={cn('w-5 h-5', active ? 'text-white' : 'text-textMuted')} />
                {showBadge && (
                  <span className="absolute top-0 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-semibold leading-none flex items-center justify-center border-2 border-surface">
                    {inboxCount > 9 ? '9+' : inboxCount}
                  </span>
                )}
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