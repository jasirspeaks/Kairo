import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  AppState,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth, supabase } from '@kairo/api';
import { parseDeepLinkUrl } from '@kairo/platform';
import { markDealReviewViewed, isDealReviewViewed } from './src/lib/dealViewTracking';
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
    status: 'ongoing' | 'complete';
  } | null>(null);

  const dismissedToastIdRef = useRef<string | null>(null);

  const syncMobileReviews = useCallback(async () => {
    if (!user?.id) return;

    try {
      // 1. Check active/ongoing reviews
      const { data: ongoingData } = await supabase
        .from('conversations')
        .select('id, deal_id, status, created_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing', 'retry_pending'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (ongoingData && ongoingData.length > 0) {
        const conv = ongoingData[0];
        if (conv.deal_id && conv.id !== dismissedToastIdRef.current) {
          let dealName = 'Your deal';
          try {
            const { data: dealData } = await supabase
              .from('deals')
              .select('deal_name')
              .eq('id', conv.deal_id)
              .single();
            if (dealData?.deal_name) dealName = dealData.deal_name;
          } catch {}

          setReviewToast({
            id: conv.id,
            dealId: conv.deal_id,
            dealName,
            status: 'ongoing',
          });
          return;
        }
      }

      // 2. Check recently completed reviews (within 60 seconds)
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentCompleted } = await supabase
        .from('conversations')
        .select('id, deal_id, status, created_at')
        .eq('user_id', user.id)
        .eq('status', 'complete')
        .gte('created_at', sixtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentCompleted && recentCompleted.length > 0) {
        const conv = recentCompleted[0];
        if (
          conv.deal_id &&
          conv.id !== dismissedToastIdRef.current &&
          !isDealReviewViewed(conv.deal_id, conv.created_at)
        ) {
          let dealName = 'Your deal';
          try {
            const { data: dealData } = await supabase
              .from('deals')
              .select('deal_name')
              .eq('id', conv.deal_id)
              .single();
            if (dealData?.deal_name) dealName = dealData.deal_name;
          } catch {}

          setReviewToast({
            id: conv.id,
            dealId: conv.deal_id,
            dealName,
            status: 'complete',
          });
          return;
        }
      }

      // If nothing ongoing or recently completed, clear ongoing toast
      setReviewToast((prev) => (prev?.status === 'ongoing' ? null : prev));
    } catch (err) {
      console.warn('[mobile] syncMobileReviews error:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    syncMobileReviews();

    const channel = supabase
      .channel(`mobile-user-reviews-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          syncMobileReviews();
        }
      )
      .subscribe();

    // Fast polling interval: 3s if review is active, 6s when idle
    const intervalMs = reviewToast?.status === 'ongoing' ? 3000 : 6000;
    const interval = setInterval(syncMobileReviews, intervalMs);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncMobileReviews();
      }
    });

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      subscription.remove();
    };
  }, [user?.id, syncMobileReviews, reviewToast?.status]);

  useEffect(() => {
    if (!reviewToast || reviewToast.status === 'ongoing') return;
    const t = setTimeout(() => {
      setReviewToast(null);
    }, 10000);
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

      {/* Review Floating Alert at Top of Mobile Screen (Dynamic Island style) */}
      {reviewToast && (
        <View style={styles.toastContainer}>
          <TouchableOpacity
            style={styles.toastCard}
            onPress={() => {
              const { dealId } = reviewToast;
              setReviewToast(null);
              if (dealId) {
                markDealReviewViewed(dealId);
                navigate('deal_review', { dealId });
              }
            }}
            activeOpacity={0.9}
          >
            <View style={styles.toastTextContainer}>
              <View style={styles.toastHeaderRow}>
                <Text style={styles.toastTitle}>
                  {reviewToast.status === 'ongoing' ? 'Review in Progress' : 'Review Ready'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    dismissedToastIdRef.current = reviewToast.id;
                    setReviewToast(null);
                  }}
                  style={styles.toastCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.toastCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.toastSubtitle} numberOfLines={2}>
                {reviewToast.status === 'ongoing'
                  ? `Review for ${reviewToast.dealName} is in progress and will be available once complete.`
                  : `Review for ${reviewToast.dealName} is ready. Tap to open.`}
              </Text>

              <View style={styles.toastActionRow}>
                <Text style={styles.toastActionText}>View Deal Review</Text>
                <Text style={styles.toastActionChevron}>›</Text>
              </View>
            </View>
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
    top: Platform.OS === 'ios' ? 48 : 16,
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  toastCard: {
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  toastTextContainer: {
    width: '100%',
  },
  toastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  toastTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  toastSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  toastActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  toastActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  toastActionChevron: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  toastCloseBtn: {
    padding: 2,
  },
  toastCloseText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
