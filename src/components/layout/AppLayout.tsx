import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { cn } from '../../lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

const COLLAPSE_KEY = 'kairo-sidebar-collapsed';

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    function syncCollapsed() {
      try {
        setCollapsed(localStorage.getItem(COLLAPSE_KEY) === 'true');
      } catch {
        // ignore storage access issues
      }
    }
    window.addEventListener('kairo-sidebar-toggle', syncCollapsed);
    return () => window.removeEventListener('kairo-sidebar-toggle', syncCollapsed);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar only */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <main className={cn('transition-all duration-200', collapsed ? 'md:ml-[76px]' : 'md:ml-64')}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 pb-24 md:pb-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomNav />
    </div>
  );
}