import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
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
  const [reviewToast, setReviewToast] = useState<{
    id: string;
    dealId: string | null;
    dealName: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`mobile-user-reviews-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newRow = payload.new as { id: string; deal_id: string | null; status: string };
          const oldRow = payload.old as { status?: string };
          if (newRow.status === 'complete' && oldRow?.status !== 'complete') {
            let dealName = 'Your deal';
            if (newRow.deal_id) {
              try {
                const { data } = await supabase
                  .from('deals')
                  .select('deal_name')
                  .eq('id', newRow.deal_id)
                  .single();
                if (data?.deal_name) {
                  dealName = data.deal_name;
                }
              } catch {
                // ignore
              }
            }
            setReviewToast({
              id: newRow.id,
              dealId: newRow.deal_id,
              dealName,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!reviewToast) return;
    const t = setTimeout(() => {
      setReviewToast(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [reviewToast]);

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

      {/* Review Ready Floating Alert */}
      {reviewToast && (
        <View style={[styles.toastContainer, showBottomNav ? styles.toastWithNav : styles.toastWithoutNav]}>
          <TouchableOpacity
            style={styles.toastCard}
            onPress={() => {
              const { id, dealId } = reviewToast;
              setReviewToast(null);
              if (dealId) {
                navigate('call_review', { dealId, callId: id });
              }
            }}
            activeOpacity={0.85}
          >
            <View style={styles.toastIcon}>
              <Text style={styles.toastSparkle}>✦</Text>
            </View>
            <View style={styles.toastTextContainer}>
              <Text style={styles.toastTitle}>Call Review Ready</Text>
              <Text style={styles.toastSubtitle} numberOfLines={1}>
                5-pillar intelligence ready for {reviewToast.dealName}
              </Text>
            </View>
            <Text style={styles.toastAction}>View →</Text>
          </TouchableOpacity>
        </View>
      )}

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
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  toastWithNav: {
    bottom: 74,
  },
  toastWithoutNav: {
    bottom: 24,
  },
  toastCard: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  toastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastSparkle: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  toastTextContainer: {
    flex: 1,
  },
  toastTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  toastSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  toastAction: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
});
