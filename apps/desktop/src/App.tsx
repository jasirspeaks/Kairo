import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@web/hooks/useAuth';
import { ErrorBoundary } from '@web/components/ui/ErrorBoundary';

// Canonical Web Pages
import { SignIn } from '@web/pages/auth/SignIn';
import { SignUp } from '@web/pages/auth/SignUp';
import { ForgotPassword } from '@web/pages/auth/ForgotPassword';
import { ResetPassword } from '@web/pages/auth/ResetPassword';
import { Onboarding } from '@web/pages/onboarding/Onboarding';
import { Dashboard } from '@web/pages/app/Dashboard';
import { NewDeal } from '@web/pages/app/NewDeal';
import { Review } from '@web/pages/app/Review';
import { Deals } from '@web/pages/app/Deals';
import { DealReview } from '@web/pages/app/DealReview';
import { Settings } from '@web/pages/app/Settings';
import { AppLayout } from '@web/components/layout/AppLayout';
import { Inbox } from '@web/pages/app/Inbox';

// Desktop-specific capabilities
import { TitleBar } from './components/TitleBar';
import { ActiveMeetingBar } from './components/ActiveMeetingBar';
import { UpdateNotification } from './components/UpdateNotification';
import { useMeetingWatcher } from './hooks/useMeetingWatcher';
import { useDesktopUpdater } from './hooks/useDesktopUpdater';

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

  const watcher = useMeetingWatcher({
    userId: user?.id,
    autoCaptureEnabled: true,
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
