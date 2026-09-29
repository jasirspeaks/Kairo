import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Subscription } from '../types';

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', uid)
      .single();
    setSubscription(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchSubscription(userId);
  }, [userId, fetchSubscription]);

  const canWrite = !!subscription && (
    subscription.status === 'active' ||
    (subscription.status === 'trialing' && new Date(subscription.trial_end).getTime() > Date.now())
  );

  const trialDaysLeft = subscription?.status === 'trialing'
    ? Math.max(0, Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    subscription,
    loading,
    canWrite,
    isExpired: subscription?.status === 'expired',
    trialDaysLeft,
    refetchSubscription: () => userId && fetchSubscription(userId),
  };
}