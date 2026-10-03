import { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { Profile } from '@kairo/core';
import { getKairoClient } from '../client';
import { getProfile } from '../services/profiles';
import { signOut as authSignOut } from '../services/auth';

export interface UseAuthReturn {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<Profile | null>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const data = await getProfile(userId);
      setProfile(data);
      return data;
    } catch {
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const client = getKairoClient();

    client.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfileData(currentUser.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setLoading(true);
        fetchProfileData(currentUser.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfileData]);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const refetchProfile = useCallback(async (): Promise<Profile | null> => {
    const client = getKairoClient();
    const currentUser = user ?? (await client.auth.getUser()).data.user;
    if (currentUser) {
      setLoading(true);
      return await fetchProfileData(currentUser.id);
    }
    return null;
  }, [user, fetchProfileData]);

  return {
    user,
    profile,
    loading,
    signOut,
    refetchProfile,
  };
}
