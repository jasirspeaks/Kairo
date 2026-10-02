import { useState, useEffect, useCallback } from 'react';
import { getKairoClient } from '../client';

export function useInboxCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async (uid: string) => {
    const client = getKairoClient();
    const { count: meetingsCount } = await client
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('status', 'unassigned')
      .is('cancelled_at', null);
    setCount(meetingsCount || 0);
  }, []);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const client = getKairoClient();
    fetchCount(userId);

    const channelId = Math.random().toString(36).slice(2);
    const channel = client
      .channel(`inbox-count-${userId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchCount(userId)
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [userId, fetchCount]);

  return count;
}
