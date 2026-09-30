import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Mic,
  Inbox,
  Settings,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth, useInboxCount, signOut } from '@kairo/api';

interface SidebarProps {
  onOpenAuthModal?: () => void;
}

export function Sidebar({ onOpenAuthModal }: SidebarProps) {
  const { user, profile } = useAuth();
  const inboxCount = useInboxCount(user?.id);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Deals', path: '/deals', icon: Building2 },
    { label: 'Record & Review', path: '/review', icon: Mic },
    { label: 'Action Inbox', path: '/inbox', icon: Inbox, badge: inboxCount },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-56 bg-surface border-r border-border flex flex-col justify-between p-3 select-none flex-shrink-0">
      <div className="flex flex-col gap-1">
        <div className="px-3 py-2 text-[11px] font-semibold text-textMuted uppercase tracking-wider">
          Workspace
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                      : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </div>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User profile footer */}
      <div className="border-t border-border pt-3 flex flex-col gap-2">
        {user ? (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surfaceHigh/50 border border-border/50">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                {(profile?.name || profile?.email || user.email || 'U')[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium text-textPrimary truncate leading-none">
                  {profile?.name || user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-textMuted truncate leading-tight mt-0.5">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="p-1 text-textMuted hover:text-danger rounded hover:bg-surface transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-2"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </aside>
  );
}
