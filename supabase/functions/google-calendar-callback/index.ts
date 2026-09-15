import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const APP_URL = Deno.env.get('APP_URL');

// State max age: 10 minutes. Generous enough for a slow consent screen,
// tight enough that a leaked/logged state value (e.g. in a proxy access
// log) isn't a standing credential.
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

// Inlined rather than imported from _shared -- mirrors signState in
// google-calendar-connect/index.ts. Kept in sync manually; check both
// files together when changing the signing scheme.
async function verifyState(state: string): Promise<string | null> {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, issuedAtStr, sigHex] = parts;

  const issuedAt = Number(issuedAtStr);
  if (!userId || !issuedAtStr || !sigHex || Number.isNaN(issuedAt)) return null;
  if (Date.now() - issuedAt > STATE_MAX_AGE_MS) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const payload = `${userId}.${issuedAtStr}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedSigHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare to avoid a timing side-channel on the signature check.
  if (expectedSigHex.length !== sigHex.length) return null;
  let diff = 0;
  for (let i = 0; i < expectedSigHex.length; i++) {
    diff |= expectedSigHex.charCodeAt(i) ^ sigHex.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return userId;
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError || !code || !state) {
    return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('google-calendar-callback: SUPABASE_SERVICE_ROLE_KEY not set, cannot verify state.');
    return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
  }

  const userId = await verifyState(state);
  if (!userId) {
    console.error('google-calendar-callback: state verification failed (missing, malformed, expired, or forged).');
    return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', tokenData);
      return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { error: upsertError } = await supabase.from('calendar_connections').upsert(
      {
        user_id: userId,
        provider: 'google',
        access_token: tokenData.access_token,
        // Google only sends a refresh_token on the very first consent.
        // Don't overwrite an existing one with nothing on a reconnect.
        ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
        token_expires_at: expiresAt,
        scope: tokenData.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

    if (upsertError) {
      console.error('calendar_connections upsert error:', upsertError);
      return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
    }

    return Response.redirect(`${APP_URL}/app/settings?calendar=connected`, 302);
  } catch (err) {
    console.error('google-calendar-callback error:', err);
    return Response.redirect(`${APP_URL}/app/settings?calendar=error`, 302);
  }
});
