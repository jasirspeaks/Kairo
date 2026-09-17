import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Total items still needing assignment across both Inbox tabs --
// unassigned upcoming meetings + unmatched calls. Used by Sidebar and
// BottomNav to show a notification badge on the Inbox nav item. Each
// consumer calls this independently (same pattern as useAuth/useSubscription
// elsewhere) rather than threading the count through props.
//
// Kept in sync via a Realtime subscription on scheduled_meetings and
// pending_calls (filtered to this user), rather than polling -- any INSERT/
// UPDATE/DELETE on either table re-runs the same count query. This makes the
// badge reflect whatever wrote to those tables (calendar sync, Fireflies
// webhook write-back, the Inbox page's own assignment actions, etc.)
// immediately, from any tab. This does NOT trigger a Google Calendar pull --
// it only reacts to rows already in the database.
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

    // Requires both tables to be added to the supabase_realtime publication
    // (see the one-time SQL step run in the Supabase dashboard). One channel,
    // two table subscriptions -- either firing just re-runs the same count
    // query rather than trying to patch the count incrementally.
    const channel = supabase
      .channel(`inbox-count-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_meetings', filter: `user_id=eq.${userId}` },
        () => fetchCount(userId)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_calls', filter: `user_id=eq.${userId}` },
        () => fetchCount(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCount]);

  return count;
}