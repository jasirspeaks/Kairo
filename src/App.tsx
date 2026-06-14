import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Landing } from './pages/Landing';
import { SignIn } from './pages/auth/SignIn';
import { SignUp } from './pages/auth/SignUp';
import { Dashboard } from './pages/app/Dashboard';
import { NewAnalysis } from './pages/app/NewAnalysis';
import { AnalysisResult } from './pages/app/AnalysisResult';
import { History } from './pages/app/History';
import { Patterns } from './pages/app/Patterns';
import { Coaching } from './pages/app/Coaching';
import { Settings } from './pages/app/Settings';
import { AppLayout } from './components/layout/AppLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-accent border-border rounded-full animate-spin" />
    </div>
  );

  if (!user) return <Navigate to="/signin" replace />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        {/* App */}
        <Route path="/app/*" element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="new" element={<NewAnalysis />} />
                <Route path="analysis/:id" element={<AnalysisResult />} />
                <Route path="history" element={<History />} />
                <Route path="patterns" element={<Patterns />} />
                <Route path="coaching" element={<Coaching />} />
                <Route path="settings" element={<Settings />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}