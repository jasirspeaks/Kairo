import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// How often the nav badge re-checks the Inbox count in the background.
// Cheap two-count query, not worth wiring a realtime subscription for.
const POLL_MS = 30_000;

// Total items still needing assignment across both Inbox tabs --
// unassigned upcoming meetings + unmatched calls. Used by Sidebar and
// BottomNav to show a notification badge on the Inbox nav item. Each
// consumer calls this independently (same pattern as useAuth/useSubscription
// elsewhere) rather than threading the count through props.
export function useInboxCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async (uid: string) => {
    const [{ count: meetingsCount }, { count: pendingCount }] = await Promise.all([
      supabase
        .from('scheduled_meetings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'unassigned')
        .is('cancelled_at', null),
      supabase
        .from('pending_calls')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'unmatched'),
    ]);
    setCount((meetingsCount || 0) + (pendingCount || 0));
  }, []);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    fetchCount(userId);
    const interval = setInterval(() => fetchCount(userId), POLL_MS);
    return () => clearInterval(interval);
  }, [userId, fetchCount]);

  return count;
}