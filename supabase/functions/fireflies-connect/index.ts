import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKeyB64 = Deno.env.get('FIREFLIES_ENCRYPTION_KEY');
  if (!rawKeyB64) {
    throw new Error('FIREFLIES_ENCRYPTION_KEY is not set');
  }
  const rawKey = Uint8Array.from(atob(rawKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivB64}:${ctB64}`;
}

async function decryptSecret(stored: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivB64, ctB64] = stored.split(':');
  if (!ivB64 || !ctB64) {
    throw new Error('Malformed encrypted secret');
  }
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintextBuf);
}

function generateWebhookSecret(): string {
  // Fireflies' own secret field accepts 16-32 characters. 32 hex chars
  // (16 random bytes) sits comfortably inside that range -- a 32-byte/
  // 64-char secret (as used elsewhere in this file for other purposes)
  // would be rejected by their form.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const KAIRO_FUNCTIONS_BASE = Deno.env.get('SUPABASE_URL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ME_QUERY = `
  query {
    user {
      email
      name
    }
  }
`;

async function validateFirefliesKey(apiKey: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: ME_QUERY }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Invalid API key' };
    }

    const json = await res.json();

    if (json.errors) {
      const message = json.errors[0]?.message || 'Fireflies rejected this API key';
      return { ok: false, error: message };
    }

    const email = json.data?.user?.email;
    if (!email) {
      return { ok: false, error: 'Could not verify Fireflies account' };
    }

    return { ok: true, email };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error reaching Fireflies' };
  }
}

function getUserSupabase(req: Request) {
  const authHeader = req.headers.get('Authorization');
  return createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader ?? '' } },
  });
}

// Whether to include the raw webhook_secret in a response. We only surface
// it while the connection hasn't been confirmed working yet (no successful
// webhook delivery recorded). Once Fireflies has proven it can reach us
// with a matching signature, there's no product reason to keep transmitting
// a live credential on every Settings page load -- this bounds the
// exposure window to "during setup" rather than "forever," which matters
// once this is serving many users instead of one.
function shouldExposeSecret(row: { status: string; last_webhook_received_at: string | null }): boolean {
  return row.status !== 'active' || !row.last_webhook_received_at;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const userSupabase = getUserSupabase(req);
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser();

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? (req.method === 'DELETE' ? 'disconnect' : 'connect');

    if (action === 'disconnect') {
      await admin.from('fireflies_connections').delete().eq('user_id', user.id);
      return json({ ok: true, status: 'disconnected' });
    }

    if (action === 'status') {
      const { data } = await admin
        .from('fireflies_connections')
        .select('status, fireflies_user_email, webhook_secret, last_validated_at, last_webhook_received_at, last_error, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!data) {
        return json({ connected: false });
      }

      return json({
        connected: true,
        status: data.status,
        email: data.fireflies_user_email,
        last_validated_at: data.last_validated_at,
        last_webhook_received_at: data.last_webhook_received_at,
        last_error: data.last_error,
        webhook_url: `${KAIRO_FUNCTIONS_BASE}/functions/v1/fireflies-webhook?user_id=${user.id}`,
        webhook_secret: shouldExposeSecret(data) ? data.webhook_secret : undefined,
      });
    }

    if (action === 'revalidate') {
      const { data: existing } = await admin
        .from('fireflies_connections')
        .select('encrypted_api_key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        return json({ error: 'No Fireflies connection found' }, 404);
      }

      const apiKey = await decryptSecret(existing.encrypted_api_key);
      const result = await validateFirefliesKey(apiKey);

      await admin
        .from('fireflies_connections')
        .update({
          status: result.ok ? 'active' : 'invalid',
          last_validated_at: new Date().toISOString(),
          last_error: result.ok ? null : result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      return json({ ok: result.ok, error: result.error });
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const body = await req.json();
    const apiKey: string | undefined = body?.api_key?.trim();

    if (!apiKey) {
      return json({ error: 'Missing api_key' }, 400);
    }

    const validation = await validateFirefliesKey(apiKey);

    if (!validation.ok) {
      return json({ error: validation.error || 'Could not verify this Fireflies API key' }, 400);
    }

    const encryptedKey = await encryptSecret(apiKey);

    const { data: existing } = await admin
      .from('fireflies_connections')
      .select('webhook_secret, status, last_webhook_received_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // Reconnecting with a new/updated API key does not invalidate a webhook
    // secret that Fireflies already has saved and working -- only mint a
    // fresh one for genuinely new connections. This avoids forcing a
    // re-paste into Fireflies' dashboard every time someone rotates their
    // API key.
    const webhookSecret = existing?.webhook_secret ?? generateWebhookSecret();

    const row = {
      user_id: user.id,
      encrypted_api_key: encryptedKey,
      webhook_secret: webhookSecret,
      fireflies_user_email: validation.email,
      // A fresh connect (or reconnect after invalid) always resets status
      // to pending -- we don't know the webhook side works again until we
      // actually see a delivery, even if the API key itself checks out.
      status: existing?.last_webhook_received_at ? 'active' : 'pending',
      last_validated_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await admin.from('fireflies_connections').update(row).eq('user_id', user.id);
    } else {
      await admin.from('fireflies_connections').insert(row);
    }

    return json({
      ok: true,
      email: validation.email,
      webhook_url: `${KAIRO_FUNCTIONS_BASE}/functions/v1/fireflies-webhook?user_id=${user.id}`,
      webhook_secret: shouldExposeSecret({ status: row.status, last_webhook_received_at: existing?.last_webhook_received_at ?? null }) ? webhookSecret : undefined,
    });
  } catch (err) {
    console.error('fireflies-connect error:', err instanceof Error ? err.message : 'Unknown error');
    // Deliberately not logging `err` itself or any request body here --
    // both can carry the plaintext API key on validation-path failures.
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});
