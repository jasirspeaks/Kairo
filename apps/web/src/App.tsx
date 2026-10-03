import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Pages
import { SignIn } from './pages/auth/SignIn';
import { SignUp } from './pages/auth/SignUp';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { Onboarding } from './pages/onboarding/Onboarding';
import { Dashboard } from './pages/app/Dashboard';
import { NewDeal } from './pages/app/NewDeal';
import { Review } from './pages/app/Review';
import { Deals } from './pages/app/Deals';
import { DealReview } from './pages/app/DealReview';
import { Settings } from './pages/app/Settings';
import { AppLayout } from './components/layout/AppLayout';
import { Inbox } from './pages/app/Inbox';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/signin" replace />;

  if (!profile?.onboarding_complete) return <Navigate to="/onboarding" replace />;

  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/signin" replace />;

  if (profile?.onboarding_complete) return <Navigate to="/app/dashboard" replace />;

  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function RootRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/signin" replace />;

  if (!profile?.onboarding_complete) return <Navigate to="/onboarding" replace />;

  return <Navigate to="/app/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root / State Gate */}
        <Route path="/" element={<RootRoute />} />

        {/* Public Auth */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Mandatory Onboarding */}
        <Route
          path="/onboarding"
          element={
            <OnboardingRoute>
              <Onboarding />
            </OnboardingRoute>
          }
        />

        {/* Authenticated Product Pages */}
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="new" element={<NewDeal />} />
                  <Route path="deals" element={<Deals />} />
                  <Route path="deals/:dealId" element={<DealReview />} />
                  <Route path="deals/:dealId/calls/:callId" element={<Review />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}