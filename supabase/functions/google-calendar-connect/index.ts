import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  'SUPABASE_SERVICE_ROLE_KEY'
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

async function signState(userId: string): Promise<string> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured'
    );
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );

  const sigHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${payload}.${sigHex}`;
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonRes(
      { error: 'Method not allowed' },
      405
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_REDIRECT_URI
  ) {
    console.error(
      'google-calendar-connect: required environment variables are missing'
    );

    return jsonRes(
      { error: 'Server misconfiguration' },
      500
    );
  }

  try {
    // The authenticated session is now the only source of user identity.
    // Never accept a user_id from query params or request body.
    const authHeader = req.headers.get(
      'Authorization'
    );

    if (!authHeader) {
      return jsonRes(
        { error: 'Unauthorized' },
        401
      );
    }

    const token = authHeader.replace(
      /^Bearer\s+/i,
      ''
    );

    if (!token) {
      return jsonRes(
        { error: 'Unauthorized' },
        401
      );
    }

    const userSupabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser(token);

    if (authError || !user) {
      return jsonRes(
        { error: 'Unauthorized' },
        401
      );
    }

    const state = await signState(user.id);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Return the authorization URL to the authenticated browser.
    // The browser then performs the top-level navigation to Google.
    return jsonRes({
      ok: true,
      auth_url: authUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unknown error';

    console.error(
      'google-calendar-connect error:',
      message
    );

    return jsonRes(
      { error: message },
      500
    );
  }
});