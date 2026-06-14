import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Plus, History, TrendingUp, 
  BookOpen, Settings, LogOut, Zap 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/new', label: 'New Analysis', icon: Plus },
  { path: '/app/history', label: 'History', icon: History },
  { path: '/app/patterns', label: 'Patterns', icon: TrendingUp },
  { path: '/app/coaching', label: 'Coaching', icon: BookOpen },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-purple-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-white tracking-tight">Kairo</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left',
                active 
                  ? 'text-white bg-primary/20 border border-primary/30 shadow-purple-glow-sm'
                  : 'text-textSecondary hover:text-white hover:bg-surfaceHigh'
              )}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-accent' : '')} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 border-t border-border pt-4 space-y-1">
        <button
          onClick={() => navigate('/app/settings')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left',
            location.pathname === '/app/settings'
              ? 'text-white bg-primary/20 border border-primary/30'
              : 'text-textSecondary hover:text-white hover:bg-surfaceHigh'
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        
        <div className="px-3 py-2 mt-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-primary/30 border border-primary/40 flex items-center justify-center text-xs font-semibold text-accent">
              {(profile?.name || profile?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{profile?.name || 'User'}</p>
              <p className="text-xs text-textMuted truncate">{profile?.email}</p>
            </div>
          </div>
          <button 
            onClick={signOut}
            className="w-full flex items-center gap-2 text-xs text-textMuted hover:text-red-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}