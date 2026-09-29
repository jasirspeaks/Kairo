import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function signState(userId: string): Promise<string> {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sigHex}`;
}

async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });
    if (!response.ok) {
      console.error(`google-calendar-connect: Google revoke returned ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('google-calendar-connect: Google revoke failed:', err instanceof Error ? err.message : 'Unknown error');
    return false;
  }
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('google-calendar-connect: required environment variables are missing');
    return jsonRes({ error: 'Server misconfiguration' }, 500);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonRes({ error: 'Unauthorized' }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonRes({ error: 'Unauthorized' }, 401);

    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
    if (authError || !user) return jsonRes({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'DELETE') {
      const { data: connection, error: readError } = await admin
        .from('calendar_connections')
        .select('id, access_token, refresh_token')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (readError) throw new Error(`Failed to read calendar connection: ${readError.message}`);

      let googleRevoked = true;
      if (connection) {
        const tokenToRevoke = connection.refresh_token || connection.access_token;
        if (tokenToRevoke) googleRevoked = await revokeGoogleToken(tokenToRevoke);

        const { error: deleteError } = await admin
          .from('calendar_connections')
          .delete()
          .eq('id', connection.id)
          .eq('user_id', user.id);

        if (deleteError) throw new Error(`Failed to disconnect calendar: ${deleteError.message}`);
      }

      return jsonRes({ ok: true, status: 'disconnected', google_revoked: googleRevoked });
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

    return jsonRes({ ok: true, auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('google-calendar-connect error:', message);
    return jsonRes({ error: message }, 500);
  }
});
