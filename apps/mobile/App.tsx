import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth, supabase } from '@kairo/api';
import { parseDeepLinkUrl } from '@kairo/platform';
import { colors } from './src/theme/colors';
import { NavigationProvider, useNavigation } from './src/navigation/NavigationContext';
import { BottomNav } from './src/components/layout/BottomNav';

// Screens
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DealsScreen } from './src/screens/DealsScreen';
import { DealReviewScreen } from './src/screens/DealReviewScreen';
import { CallReviewScreen } from './src/screens/CallReviewScreen';
import { NewDealScreen } from './src/screens/NewDealScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';

function AppShell() {
  const { user, profile, loading } = useAuth();
  const { currentScreen, routeParams, navigate } = useNavigation();
  const [resetFlowActive, setResetFlowActive] = useState(false);

  useEffect(() => {
    async function processUrl(url: string) {
      if (!url) return;

      const params = parseDeepLinkUrl(url);

      if (url.includes('reset-password') || params.type === 'recovery') {
        if (params.error || params.error_description) {
          Alert.alert(
            'Password Reset Link Invalid',
            decodeURIComponent(params.error_description || params.error || 'The reset link is expired or invalid. Please request a new one.').replace(/\+/g, ' ')
          );
          return;
        }

        try {
          if (params.code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
            if (exchangeError) throw exchangeError;
          } else if (params.access_token && params.refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            if (sessionError) throw sessionError;
          }
          setResetFlowActive(true);
          navigate('reset_password');
        } catch (err: any) {
          Alert.alert(
            'Reset Error',
            err?.message || 'Unable to establish password reset session. Please request a new link.'
          );
        }
      } else if (url.includes('auth/callback')) {
        if (params.error || params.error_description) {
          Alert.alert(
            'Authentication Error',
            decodeURIComponent(params.error_description || params.error || 'Authentication failed.').replace(/\+/g, ' ')
          );
          return;
        }

        try {
          if (params.code) {
            await supabase.auth.exchangeCodeForSession(params.code);
          } else if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          }
        } catch {
          // Handled by auth state listener
        }
      } else if (url.includes('calendar/callback')) {
        navigate('settings', { calendar: params.calendar || 'connected' });
      }
    }

    // Cold launch deep link
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        processUrl(initialUrl);
      }
    });

    // Warm listener
    const subscription = Linking.addEventListener('url', ({ url }) => {
      processUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [navigate]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Active password reset flow takes priority
  if (resetFlowActive || currentScreen === 'reset_password') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ResetPasswordScreen
          onSuccess={() => {
            setResetFlowActive(false);
            navigate('dashboard');
          }}
          onCancel={() => {
            setResetFlowActive(false);
            navigate('dashboard');
          }}
        />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <AuthScreen />
      </SafeAreaView>
    );
  }

  if (!profile?.onboarding_complete) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <OnboardingScreen onCompleted={() => navigate('dashboard')} />
      </SafeAreaView>
    );
  }

  // Render active screen
  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'deals':
        return <DealsScreen />;
      case 'deal_review':
        return <DealReviewScreen dealId={routeParams.dealId} />;
      case 'call_review':
        return <CallReviewScreen dealId={routeParams.dealId} callId={routeParams.callId} />;
      case 'new_deal':
        return <NewDealScreen />;
      case 'inbox':
        return <InboxScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'record':
        return <RecordScreen dealId={routeParams.dealId} />;
      default:
        return <DashboardScreen />;
    }
  };

  // Show bottom nav on top tabs and primary workflows
  const showBottomNav =
    currentScreen === 'dashboard' ||
    currentScreen === 'deals' ||
    currentScreen === 'inbox' ||
    currentScreen === 'settings';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.content}>{renderScreen()}</View>
      {showBottomNav && <BottomNav />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
});
