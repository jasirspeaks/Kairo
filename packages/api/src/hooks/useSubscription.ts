import { useState, useEffect, useCallback } from 'react';
import { Subscription } from '@kairo/core';
import { getSubscription } from '../services/subscriptions';

export interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  canWrite: boolean;
  isExpired: boolean;
  trialDaysLeft: number | null;
  refetchSubscription: () => Promise<void>;
}

export function useSubscription(userId: string | undefined): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async (uid: string) => {
    try {
      const data = await getSubscription(uid);
      setSubscription(data);
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSubscription(userId);

    const handleFocus = () => {
      fetchSubscription(userId);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      window.addEventListener('visibilitychange', handleFocus);
    }

    const interval = setInterval(() => {
      fetchSubscription(userId);
    }, 60_000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleFocus);
      }
      clearInterval(interval);
    };
  }, [userId, fetchSubscription]);

  const canWrite =
    !!subscription &&
    (subscription.status === 'active' ||
      (subscription.status === 'trialing' &&
        new Date(subscription.trial_end).getTime() > Date.now()));

  const trialDaysLeft =
    subscription?.status === 'trialing'
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.trial_end).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return {
    subscription,
    loading,
    canWrite,
    isExpired: subscription?.status === 'expired',
    trialDaysLeft,
    refetchSubscription: async () => {
      if (userId) await fetchSubscription(userId);
    },
  };
}
