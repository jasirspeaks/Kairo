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
  refetchProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async (userId: string) => {
    try {
      const data = await getProfile(userId);
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const client = getKairoClient();

    client.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileData(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfileData]);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user) {
      await fetchProfileData(user.id);
    }
  }, [user, fetchProfileData]);

  return {
    user,
    profile,
    loading,
    signOut,
    refetchProfile,
  };
}
