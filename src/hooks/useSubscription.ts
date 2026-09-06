import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Subscription } from '../types';

// Client-side mirror of the server-side has_write_access() Postgres
// function used in RLS WITH CHECK clauses (deals/conversations/
// pending_schedule_intents inserts). Keep these two in sync -- this
// one only controls what the UI shows; the database is the actual
// enforcement and does not trust this value.
const WRITE_ALLOWED_STATUSES: Subscription['status'][] = ['trialing', 'active'];

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

  const canWrite = !!subscription && WRITE_ALLOWED_STATUSES.includes(subscription.status);

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