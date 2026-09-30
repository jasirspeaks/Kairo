import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@kairo/api';
import { RefreshCw } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { DealsView } from './views/DealsView';
import { RecordReviewView } from './views/RecordReviewView';
import { InboxView } from './views/InboxView';
import { SettingsView } from './views/SettingsView';
import { AuthView } from './views/AuthView';

export function App() {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          <p className="text-textMuted text-xs font-mono">Connecting to Kairo...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="h-screen w-screen bg-bg text-textPrimary flex flex-col antialiased overflow-hidden select-none">
        {/* Tauri Native Titlebar */}
        <TitleBar isConnected={!!user} />

        {/* Desktop Main Workspace Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar onOpenAuthModal={() => setShowAuthModal(true)} />

          {/* Routed Views */}
          <main className="flex-1 flex flex-col overflow-hidden bg-bg">
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/deals" element={<DealsView />} />
              <Route path="/review" element={<RecordReviewView />} />
              <Route path="/inbox" element={<InboxView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {/* Sign In / Sign Up Modal */}
        {(showAuthModal || !user) && (
          <AuthView onClose={() => setShowAuthModal(false)} />
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
