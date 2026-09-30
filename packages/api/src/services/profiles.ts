import { Profile } from '@kairo/core';
import { getClientConfig, getKairoClient, KairoClient } from '../client';

export async function getProfile(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Profile>,
  client: KairoClient = getKairoClient()
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function deleteAccount(
  confirmEmail: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('Your session expired — please sign in again.');
  }

  const { supabaseUrl, supabaseAnonKey } = getClientConfig();
  const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ confirm_email: confirmEmail }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Something went wrong deleting your account. Please try again.');
  }

  await client.auth.signOut();
}
