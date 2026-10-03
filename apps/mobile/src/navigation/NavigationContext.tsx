import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type ScreenName =
  | 'dashboard'
  | 'deals'
  | 'inbox'
  | 'settings'
  | 'new_deal'
  | 'deal_review'
  | 'call_review'
  | 'record'
  | 'signin'
  | 'signup'
  | 'forgot_password'
  | 'onboarding';

export interface Route {
  name: ScreenName;
  params?: Record<string, any>;
}

export interface NavigationContextValue {
  currentRoute: Route;
  currentScreen: ScreenName;
  routeParams: Record<string, any>;
  activeTab: 'dashboard' | 'deals' | 'inbox' | 'settings';
  navigate: (name: ScreenName, params?: Record<string, any>) => void;
  goBack: () => void;
  canGoBack: boolean;
  switchTab: (tab: 'dashboard' | 'deals' | 'inbox' | 'settings') => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  initialScreen = 'dashboard',
  children,
}: {
  initialScreen?: ScreenName;
  children: React.ReactNode;
}) {
  const [history, setHistory] = useState<Route[]>([{ name: initialScreen }]);

  const currentRoute = history[history.length - 1] || { name: initialScreen };

  const activeTab = useMemo<'dashboard' | 'deals' | 'inbox' | 'settings'>(() => {
    if (['dashboard', 'deals', 'inbox', 'settings'].includes(currentRoute.name)) {
      return currentRoute.name as 'dashboard' | 'deals' | 'inbox' | 'settings';
    }
    // If inside a deal review or call review, keep 'deals' tab highlighted
    if (currentRoute.name === 'deal_review' || currentRoute.name === 'call_review') {
      return 'deals';
    }
    return 'dashboard';
  }, [currentRoute.name]);

  const navigate = useCallback((name: ScreenName, params?: Record<string, any>) => {
    setHistory((prev) => [...prev, { name, params }]);
  }, []);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  const switchTab = useCallback((tab: 'dashboard' | 'deals' | 'inbox' | 'settings') => {
    setHistory([{ name: tab }]);
  }, []);

  const canGoBack = history.length > 1;

  const value = useMemo(
    () => ({
      currentRoute,
      currentScreen: currentRoute.name,
      routeParams: currentRoute.params || {},
      activeTab,
      navigate,
      goBack,
      canGoBack,
      switchTab,
    }),
    [currentRoute, activeTab, navigate, goBack, canGoBack, switchTab]
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
