import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Zap, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface TopBarProps {
  title?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

export function TopBar({ title, onBack, action }: TopBarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border pt-safe-t">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2 min-w-0">
          {onBack ? (
            <button onClick={onBack} className="w-9 h-9 -ml-2 flex items-center justify-center rounded-lg active:bg-surfaceHigh">
              <ChevronLeft className="w-5 h-5 text-textPrimary" />
            </button>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
          )}
          <span className="font-display font-bold text-textPrimary truncate">
            {title || 'Kairo'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary"
          >
            {(profile?.name || profile?.email || 'U')[0].toUpperCase()}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-4 top-14 z-50 w-44 card p-1.5 animate-fade-in">
            <button
              onClick={() => { setMenuOpen(false); navigate('/app/settings'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-textSecondary hover:bg-surfaceHigh min-h-[44px]"
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 min-h-[44px]"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </header>
  );
}