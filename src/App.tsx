import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Pages
import { Landing } from './pages/Landing';
import { SignIn } from './pages/auth/SignIn';
import { SignUp } from './pages/auth/SignUp';
import { Onboarding } from './pages/onboarding/Onboarding';
import { Dashboard } from './pages/app/Dashboard';
import { NewDeal } from './pages/app/NewDeal';
import { Review } from './pages/app/Review';
import { DealWorkspace } from './pages/app/DealWorkspace';
import { RiskCenter } from './pages/app/RiskCenter';
import { Settings } from './pages/app/Settings';
import { AppLayout } from './components/layout/AppLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );

  if (!user) return <Navigate to="/signin" replace />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signin" replace />;
  if (profile?.onboarding_complete) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />

        {/* App */}
        <Route path="/app/*" element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="new" element={<NewDeal />} />
                <Route path="deals/:dealId/calls/:callId" element={<Review />} />
                <Route path="workspace" element={<DealWorkspace />} />
                <Route path="workspace/deals/:dealId" element={<DealWorkspace />} />
                <Route path="risk-center" element={<RiskCenter />} />
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