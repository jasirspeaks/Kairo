import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Plus, FolderOpen, Settings, Inbox, ChevronsLeft, ChevronsRight, LogOut
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/deals', label: 'Deals', icon: FolderOpen },
  { path: '/app/inbox', label: 'Inbox', icon: Inbox },
  { path: '/app/settings', label: 'Settings', icon: Settings },
];

const COLLAPSE_KEY = 'kairo-sidebar-collapsed';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore storage failures (private browsing, etc.)
    }
    // Let AppLayout (and anything else) react to width changes.
    window.dispatchEvent(new Event('kairo-sidebar-toggle'));
  }, [collapsed]);

  function isActive(path: string) {
    if (path === '/app/deals') {
      return location.pathname.startsWith('/app/deals');
    }
    return location.pathname === path;
  }

  const initial = (profile?.name || profile?.email || 'U')[0].toUpperCase();

  return (
    <aside
      className={cn(
        'h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40 transition-all duration-200',
        collapsed ? 'w-[76px]' : 'w-64'
      )}
    >
      {/* Logo — collapsed state: hovering the logo reveals a right-pointing
          double-chevron; clicking it expands the sidebar.
          Expanded state: logo is static, and a dedicated, always-visible
          double-chevron button sits to its right to collapse the sidebar. */}
      <div className={cn('py-6 border-b border-border flex items-center', collapsed ? 'px-4 justify-center' : 'px-5 justify-between')}>
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="group relative w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden"
          >
            <img
              src="/logo-mark.png"
              alt="Kairo"
              className="absolute inset-0 w-8 h-8 rounded-lg object-contain transition-opacity duration-150 group-hover:opacity-0"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-surfaceHigh text-textPrimary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <ChevronsRight className="w-4 h-4" />
            </span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo-mark.png"
                alt="Kairo"
                className="w-8 h-8 rounded-lg object-contain flex-shrink-0"
              />
              <span className="font-display font-bold text-xl text-textPrimary tracking-tight truncate">
                Kairo
              </span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh transition-colors duration-200"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              title={collapsed ? label : undefined}
              className={cn(
                'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200 text-left',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'text-primary bg-primary/10 border border-primary/20'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHigh'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-primary' : '')} />
              {!collapsed && label}
            </button>
          );
        })}
      </nav>

      {/* New Deal — accent action, pinned above the profile footer. Always
          live: this just navigates to the New Deal page. If the trial/subscription
          has lapsed, the upgrade prompt appears from inside that page,
          only once the person fills in details and clicks Schedule /
          Upload / Record — not here. */}
      <div className="px-3 pt-3 border-t border-border">
        <button
          onClick={() => navigate('/app/new')}
          title={collapsed ? 'New Deal' : undefined}
          className="w-full flex items-center justify-center rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primaryHover transition-colors duration-200 shadow-purple-glow-sm px-0 py-2.5"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span
            className={cn(
              'overflow-hidden whitespace-nowrap transition-all duration-200',
              collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[140px] opacity-100 ml-2'
            )}
          >
            New Deal
          </span>
        </button>
      </div>

      {/* Profile indicator — bottom of sidebar */}
      <div className="relative px-3 py-4">
        <button
          onClick={() => setMenuOpen(v => !v)}
          title={collapsed ? (profile?.name || profile?.email || 'Account') : undefined}
          className={cn(
            'w-full flex items-center rounded-lg text-left transition-colors duration-200 hover:bg-surfaceHigh',
            collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-2'
          )}
        >
          <span className="w-8 h-8 flex-shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
            {initial}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-textPrimary truncate">
                {profile?.name || 'Account'}
              </span>
              <span className="block text-xs text-textSecondary truncate">
                {profile?.email || ''}
              </span>
            </span>
          )}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              className={cn(
                'absolute z-50 w-44 card p-1.5 animate-fade-in bottom-[calc(100%-8px)]',
                collapsed ? 'left-[calc(100%+8px)]' : 'left-3'
              )}
            >
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 min-h-[44px]"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}