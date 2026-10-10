import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth, supabase } from '@kairo/api';
import { parseDeepLinkUrl } from '@kairo/platform';
import { markDealReviewViewed } from './src/lib/dealViewTracking';
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

  useEffect(() => {
    if (!user?.id) return;

    // Check for ongoing reviews on mount
    supabase
      .from('conversations')
      .select('id, deal_id, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'retry_pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const conv = data[0];
        if (!conv.deal_id) return;
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
      });

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
        async (payload) => {
          const newRow = payload.new as { id?: string; deal_id?: string | null; status?: string };
          if (!newRow || !newRow.id || !newRow.deal_id) return;

          const isOngoing = newRow.status === 'pending' || newRow.status === 'processing' || newRow.status === 'retry_pending';
          const isComplete = newRow.status === 'complete';

          if (!isOngoing && !isComplete) {
            setReviewToast((prev) => (prev?.id === newRow.id ? null : prev));
            return;
          }

          let dealName = 'Your deal';
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

          setReviewToast({
            id: newRow.id,
            dealId: newRow.deal_id,
            dealName,
            status: isComplete ? 'complete' : 'ongoing',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
            style={[
              styles.toastCard,
              reviewToast.status === 'ongoing' ? styles.toastCardOngoing : styles.toastCardComplete,
            ]}
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
            <View
              style={[
                styles.toastIcon,
                reviewToast.status === 'ongoing' ? styles.toastIconOngoing : styles.toastIconComplete,
              ]}
            >
              <Text
                style={[
                  styles.toastSparkle,
                  reviewToast.status === 'ongoing' ? styles.toastSparkleOngoing : styles.toastSparkleComplete,
                ]}
              >
                ✦
              </Text>
            </View>

            <View style={styles.toastTextContainer}>
              <View style={styles.toastHeaderRow}>
                <View style={styles.toastBadgePill}>
                  <Text style={styles.toastBadgeText}>KAIRO</Text>
                </View>
                <Text style={styles.toastNowText}>· NOW</Text>
              </View>

              <View style={styles.toastTitleRow}>
                <Text style={styles.toastTitle}>
                  {reviewToast.status === 'ongoing' ? 'Call Review in Progress' : 'Call Review Ready'}
                </Text>
                {reviewToast.status === 'ongoing' && <View style={styles.toastLiveDot} />}
              </View>

              <Text style={styles.toastSubtitle} numberOfLines={2}>
                {reviewToast.status === 'ongoing'
                  ? `Review for ${reviewToast.dealName} is ongoing and will be ready shortly.`
                  : `Review for ${reviewToast.dealName} is ready. Tap to inspect.`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setReviewToast(null)}
              style={styles.toastCloseBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.toastCloseText}>✕</Text>
            </TouchableOpacity>
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
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  toastCardOngoing: {
    borderColor: colors.primary,
  },
  toastCardComplete: {
    borderColor: 'rgba(61, 214, 140, 0.45)',
  },
  toastIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconOngoing: {
    backgroundColor: 'rgba(112, 66, 197, 0.2)',
    borderColor: colors.primary,
  },
  toastIconComplete: {
    backgroundColor: 'rgba(61, 214, 140, 0.15)',
    borderColor: 'rgba(61, 214, 140, 0.4)',
  },
  toastSparkle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  toastSparkleOngoing: {
    color: colors.primary,
  },
  toastSparkleComplete: {
    color: '#3DD68C',
  },
  toastTextContainer: {
    flex: 1,
  },
  toastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  toastBadgePill: {
    backgroundColor: '#211333',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 32, 68, 0.6)',
  },
  toastBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  toastNowText: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  toastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  toastLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  toastSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  toastCloseBtn: {
    padding: 4,
  },
  toastCloseText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
