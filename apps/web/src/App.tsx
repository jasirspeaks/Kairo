import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppLayout } from './components/layout/AppLayout';

// Lazy-loaded Pages for Route Code-Splitting
const SignIn = React.lazy(() => import('./pages/auth/SignIn').then(m => ({ default: m.SignIn })));
const SignUp = React.lazy(() => import('./pages/auth/SignUp').then(m => ({ default: m.SignUp })));
const ForgotPassword = React.lazy(() => import('./pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword = React.lazy(() => import('./pages/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Onboarding = React.lazy(() => import('./pages/onboarding/Onboarding').then(m => ({ default: m.Onboarding })));
const Dashboard = React.lazy(() => import('./pages/app/Dashboard').then(m => ({ default: m.Dashboard })));
const NewDeal = React.lazy(() => import('./pages/app/NewDeal').then(m => ({ default: m.NewDeal })));
const Review = React.lazy(() => import('./pages/app/Review').then(m => ({ default: m.Review })));
const Deals = React.lazy(() => import('./pages/app/Deals').then(m => ({ default: m.Deals })));
const DealReview = React.lazy(() => import('./pages/app/DealReview').then(m => ({ default: m.DealReview })));
const Settings = React.lazy(() => import('./pages/app/Settings').then(m => ({ default: m.Settings })));
const Inbox = React.lazy(() => import('./pages/app/Inbox').then(m => ({ default: m.Inbox })));
const PrivacyPolicy = React.lazy(() => import('./pages/legal/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));

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
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Root / State Gate */}
          <Route path="/" element={<RootRoute />} />

          {/* Public Auth */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<Navigate to="/" replace />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />

          {/* Public Legal */}
          <Route path="/privacy" element={<PrivacyPolicy />} />

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
      </Suspense>
    </BrowserRouter>
  );
}