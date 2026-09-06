import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';
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

// New Deal is a pure write surface -- there's nothing on this page worth
// showing read-only, unlike Deal Review or Call Review. Once the trial
// (or subscription) has lapsed, send the user to Dashboard instead of
// rendering a form whose submit buttons would just fail against RLS.
// This is a UX redirect, not the enforcement -- the database's
// has_write_access() check is what actually blocks the insert either way.
function NewDealRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { canWrite, loading } = useSubscription(user?.id);
  if (loading) return null;
  if (!canWrite) return <Navigate to="/app/dashboard?upgrade=1" replace />;
  return <>{children}</>;
}

function RootRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/signin" replace />;
  if (!profile?.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/app/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<RootRoute />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />

        {/* App */}
        <Route path="/app/*" element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="new" element={<NewDealRoute><NewDeal /></NewDealRoute>} />
                <Route path="deals" element={<Deals />} />
                <Route path="deals/:dealId" element={<DealReview />} />
                <Route path="deals/:dealId/calls/:callId" element={<Review />} />
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