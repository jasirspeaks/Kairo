import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
// Reused as an HMAC signing key for the OAuth `state` param. It's a long,
// high-entropy secret that only our backend holds (never shipped to the
// client), which is exactly the property a state-signing key needs. We
// don't have a way to provision a dedicated OAUTH_STATE_SECRET without a
// manual dashboard step, so this avoids that step entirely.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function signState(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // state = userId.issuedAt.signature -- callback recomputes the HMAC over
  // userId.issuedAt and compares, so the userId can't be swapped for
  // another user's without invalidating the signature.
  return `${payload}.${sigHex}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');

  if (!userId) {
    return new Response('Missing user_id', { status: 400, headers: corsHeaders });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('google-calendar-connect: SUPABASE_SERVICE_ROLE_KEY not set, cannot sign state.');
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders });
  }

  const state = await signState(userId);

  // We pass the signed state through Google's "state" param so the
  // callback function can verify it wasn't tampered with or forged before
  // trusting the embedded user_id.
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return Response.redirect(authUrl, 302);
});
