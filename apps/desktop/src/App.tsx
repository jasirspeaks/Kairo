import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@web/hooks/useAuth';
import { ErrorBoundary } from '@web/components/ui/ErrorBoundary';
import { AppLayout } from '@web/components/layout/AppLayout';

// Lazy-loaded Canonical Web Pages
const SignIn = React.lazy(() => import('@web/pages/auth/SignIn').then(m => ({ default: m.SignIn })));
const SignUp = React.lazy(() => import('@web/pages/auth/SignUp').then(m => ({ default: m.SignUp })));
const ForgotPassword = React.lazy(() => import('@web/pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword = React.lazy(() => import('@web/pages/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Onboarding = React.lazy(() => import('@web/pages/onboarding/Onboarding').then(m => ({ default: m.Onboarding })));
const Dashboard = React.lazy(() => import('@web/pages/app/Dashboard').then(m => ({ default: m.Dashboard })));
const NewDeal = React.lazy(() => import('@web/pages/app/NewDeal').then(m => ({ default: m.NewDeal })));
const Review = React.lazy(() => import('@web/pages/app/Review').then(m => ({ default: m.Review })));
const Deals = React.lazy(() => import('@web/pages/app/Deals').then(m => ({ default: m.Deals })));
const DealReview = React.lazy(() => import('@web/pages/app/DealReview').then(m => ({ default: m.DealReview })));
const Settings = React.lazy(() => import('@web/pages/app/Settings').then(m => ({ default: m.Settings })));
const Inbox = React.lazy(() => import('@web/pages/app/Inbox').then(m => ({ default: m.Inbox })));

// Desktop-specific capabilities
import { TitleBar } from './components/TitleBar';
import { ActiveMeetingBar } from './components/ActiveMeetingBar';
import { UpdateNotification } from './components/UpdateNotification';
import { useMeetingWatcher } from './hooks/useMeetingWatcher';
import { useDesktopUpdater } from './hooks/useDesktopUpdater';
import { loadLocalPreferences } from '@kairo/platform';

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

function DesktopShell() {
  const { user } = useAuth();
  const updater = useDesktopUpdater();
  const [autoCaptureEnabled] = React.useState(() => {
    try {
      return loadLocalPreferences().capture.auto_capture_enabled;
    } catch {
      return true;
    }
  });

  const watcher = useMeetingWatcher({
    userId: user?.id,
    autoCaptureEnabled,
  });

  return (
    <div className="min-h-screen bg-bg text-textPrimary flex flex-col antialiased select-none">
      {/* Native Desktop TitleBar with Version & Update Status */}
      <TitleBar
        isConnected={!!user}
        currentVersion={updater.currentVersion}
        updateAvailable={updater.status === 'available'}
        isCheckingUpdate={updater.status === 'checking'}
        onCheckUpdate={() => updater.checkForUpdates(true)}
      />

      {/* Non-intrusive Update Notification Banner */}
      <UpdateNotification updater={updater} />

      {/* Floating Active Meeting Intelligence Bar */}
      <ActiveMeetingBar
        meeting={watcher.currentMeeting}
        dealName={watcher.currentMeeting?.deal_name}
        companyName={watcher.currentMeeting?.company_name}
        isCapturing={watcher.isCapturing}
        isPaused={watcher.isPaused}
        captureStatus={watcher.captureStatus}
        elapsedMs={watcher.elapsedMs}
        onPause={watcher.pauseCapture}
        onResume={watcher.resumeCapture}
        onStop={watcher.stopCapture}
        onDiscard={watcher.discardCapture}
      />

      {/* Main Routed Area */}
      <div className="flex-1">
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
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DesktopShell />
    </BrowserRouter>
  );
}

export default App;
