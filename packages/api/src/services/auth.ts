import {
  AuthChangeEvent,
  AuthResponse,
  OAuthResponse,
  Session,
  SignInWithPasswordCredentials,
  SignUpWithPasswordCredentials,
  User,
  UserResponse,
} from '@supabase/supabase-js';
import { getKairoClient, KairoClient } from '../client';

export async function getSession(client: KairoClient = getKairoClient()): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser(client: KairoClient = getKairoClient()): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signInWithPassword(
  credentials: SignInWithPasswordCredentials,
  client: KairoClient = getKairoClient()
): Promise<AuthResponse> {
  return client.auth.signInWithPassword(credentials);
}

export async function signInWithOAuth(
  provider: 'google',
  redirectTo?: string,
  client: KairoClient = getKairoClient()
): Promise<OAuthResponse> {
  return client.auth.signInWithOAuth({
    provider,
    options: redirectTo ? { redirectTo } : undefined,
  });
}

export async function signUp(
  credentials: SignUpWithPasswordCredentials,
  client: KairoClient = getKairoClient()
): Promise<AuthResponse> {
  return client.auth.signUp(credentials);
}

export async function signOut(client: KairoClient = getKairoClient()): Promise<{ error: Error | null }> {
  return client.auth.signOut();
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
  client: KairoClient = getKairoClient()
) {
  return client.auth.onAuthStateChange(callback);
}

export async function resetPasswordForEmail(
  email: string,
  redirectTo?: string,
  client: KairoClient = getKairoClient()
): Promise<{ error: Error | null }> {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || `${window.location.origin}/auth/reset-password`,
  });
  return { error };
}

export async function updateUserPassword(
  password: string,
  client: KairoClient = getKairoClient()
): Promise<UserResponse> {
  return client.auth.updateUser({ password });
}
