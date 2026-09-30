import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@kairo/api';
import { ShieldAlert, RefreshCw } from 'lucide-react';

// Desktop Shell view
export function App() {
  const { user, profile, loading } = useAuth();

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
      <div className="min-h-screen bg-bg text-textPrimary flex flex-col antialiased select-none">
        {/* Tauri / Desktop Titlebar drag region */}
        <div
          data-tauri-drag-region
          className="h-8 bg-surface border-b border-border/50 flex items-center justify-between px-4 text-xs font-medium text-textMuted select-none cursor-default"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-semibold text-textPrimary">Kairo Desktop</span>
          </div>
          <span className="text-[10px] text-textMuted font-mono">v0.1.0</span>
        </div>

        {/* Desktop App Body */}
        <div className="flex-1 flex flex-col p-6 max-w-6xl w-full mx-auto">
          <div className="card p-6 flex flex-col gap-4">
            <h1 className="text-2xl font-bold text-textPrimary font-display">
              Kairo Deal Intelligence Co-pilot
            </h1>
            <p className="text-textSecondary text-sm">
              Desktop client surface powered by shared <code className="text-primary font-mono">@kairo/core</code>, <code className="text-primary font-mono">@kairo/api</code>, and <code className="text-primary font-mono">@kairo/platform</code>.
            </p>

            <div className="p-4 rounded-lg bg-surfaceHigh border border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-textMuted">Authentication Status</p>
                <p className="text-sm font-semibold text-textPrimary">
                  {user ? `Signed in as ${profile?.email || user.email}` : 'Not signed in'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${user ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-xs text-textSecondary">{user ? 'Connected' : 'Guest'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
