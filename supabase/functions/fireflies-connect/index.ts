import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'GET, POST, DELETE, OPTIONS',
};

async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKeyB64 = Deno.env.get('FIREFLIES_ENCRYPTION_KEY');

  if (!rawKeyB64) {
    throw new Error('FIREFLIES_ENCRYPTION_KEY is not set');
  }

  const rawKey = Uint8Array.from(
    atob(rawKeyB64),
    (c) => c.charCodeAt(0)
  );

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const ivB64 = btoa(String.fromCharCode(...iv));
  const ciphertextB64 = btoa(
    String.fromCharCode(...new Uint8Array(ciphertext))
  );

  return `${ivB64}:${ciphertextB64}`;
}

async function decryptSecret(stored: string): Promise<string> {
  const key = await getEncryptionKey();

  const [ivB64, ciphertextB64] = stored.split(':');

  if (!ivB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted secret');
  }

  const iv = Uint8Array.from(
    atob(ivB64),
    (c) => c.charCodeAt(0)
  );

  const ciphertext = Uint8Array.from(
    atob(ciphertextB64),
    (c) => c.charCodeAt(0)
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const ME_QUERY = `
  query {
    user {
      email
      name
    }
  }
`;

async function validateFirefliesKey(
  apiKey: string
): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      'https://api.fireflies.ai/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: ME_QUERY,
        }),
      }
    );

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: 'Invalid API key',
      };
    }

    let data: any = {};

    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        error: `Fireflies returned an invalid response (${response.status})`,
      };
    }

    if (data.errors?.length) {
      return {
        ok: false,
        error:
          data.errors[0]?.message ||
          'Fireflies rejected this API key',
      };
    }

    const email = data.data?.user?.email;

    if (!email) {
      return {
        ok: false,
        error: 'Could not verify the Fireflies account',
      };
    }

    return {
      ok: true,
      email,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Network error reaching Fireflies',
    };
  }
}


function json(
  body: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

function shouldExposeWebhookSecret(
  status: string,
  lastWebhookReceivedAt: string | null
): boolean {
  return (
    status !== 'active' ||
    !lastWebhookReceivedAt
  );
}

serve(async (req) => {
  // IMPORTANT:
  // The browser sends this before DELETE/POST requests.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !Deno.env.get('FIREFLIES_ENCRYPTION_KEY')
  ) {
    console.error(
      'fireflies-connect: required environment variables are missing'
    );

    return json(
      {
        error:
          'Fireflies integration is not configured on the server.',
      },
      500
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return json(
        { error: 'Unauthorized' },
        401
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return json(
        { error: 'Unauthorized' },
        401
      );
    }

    const admin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return json(
        { error: 'Unauthorized' },
        401
      );
    }

    const url = new URL(req.url);

    const action =
      url.searchParams.get('action') ||
      (req.method === 'DELETE'
        ? 'disconnect'
        : 'connect');

    // ------------------------------------------------------------
    // DISCONNECT
    // ------------------------------------------------------------

    if (action === 'disconnect') {
      const {
        error: deleteError,
      } = await admin
        .from('fireflies_connections')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error(
          'fireflies-connect disconnect error:',
          deleteError
        );

        return json(
          {
            error:
              `Failed to disconnect Fireflies: ${deleteError.message}`,
          },
          500
        );
      }

      return json({
        ok: true,
        status: 'disconnected',
      });
    }

    // ------------------------------------------------------------
    // STATUS
    // ------------------------------------------------------------

    if (action === 'status') {
      const {
        data,
        error,
      } = await admin
        .from('fireflies_connections')
        .select(
          [
            'status',
            'fireflies_user_email',
            'webhook_secret',
            'last_validated_at',
            'last_webhook_received_at',
            'last_error',
            'created_at',
          ].join(', ')
        )
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error(
          'fireflies-connect status error:',
          error
        );

        return json(
          {
            error:
              `Failed to load Fireflies connection: ${error.message}`,
          },
          500
        );
      }

      if (!data) {
        return json({
          connected: false,
        });
      }

      return json({
        connected: true,
        status: data.status,
        email: data.fireflies_user_email,
        last_validated_at:
          data.last_validated_at,
        last_webhook_received_at:
          data.last_webhook_received_at,
        last_error: data.last_error,
        webhook_url:
          `${SUPABASE_URL}/functions/v1/fireflies-webhook?user_id=${user.id}`,
        webhook_secret:
          shouldExposeWebhookSecret(
            data.status,
            data.last_webhook_received_at
          )
            ? data.webhook_secret
            : undefined,
      });
    }

    // ------------------------------------------------------------
    // REVALIDATE
    // ------------------------------------------------------------

    if (action === 'revalidate') {
      const {
        data: existing,
        error,
      } = await admin
        .from('fireflies_connections')
        .select('encrypted_api_key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        return json(
          {
            error:
              `Failed to read Fireflies connection: ${error.message}`,
          },
          500
        );
      }

      if (!existing) {
        return json(
          {
            error:
              'No Fireflies connection found',
          },
          404
        );
      }

      const apiKey =
        await decryptSecret(
          existing.encrypted_api_key
        );

      const validation =
        await validateFirefliesKey(apiKey);

      const {
        error: updateError,
      } = await admin
        .from('fireflies_connections')
        .update({
          status: validation.ok
            ? 'active'
            : 'invalid',
          last_validated_at:
            new Date().toISOString(),
          last_error: validation.ok
            ? null
            : validation.error,
          updated_at:
            new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        return json(
          {
            error:
              `Failed to save Fireflies status: ${updateError.message}`,
          },
          500
        );
      }

      return json({
        ok: validation.ok,
        error: validation.ok
          ? undefined
          : validation.error,
      });
    }

    // ------------------------------------------------------------
    // CONNECT / RECONNECT
    // ------------------------------------------------------------

    if (req.method !== 'POST') {
      return json(
        {
          error: 'Method not allowed',
        },
        405
      );
    }

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          error: 'Invalid JSON body',
        },
        400
      );
    }

    const apiKey =
      typeof body?.api_key === 'string'
        ? body.api_key.trim()
        : '';

    if (!apiKey) {
      return json(
        {
          error:
            'Missing Fireflies API key',
        },
        400
      );
    }

    const validation =
      await validateFirefliesKey(apiKey);

    if (!validation.ok) {
      return json(
        {
          error:
            validation.error ||
            'Could not verify this Fireflies API key',
        },
        400
      );
    }

    const encryptedApiKey =
      await encryptSecret(apiKey);

    const {
      data: existing,
      error: existingError,
    } = await admin
      .from('fireflies_connections')
      .select(
        'webhook_secret, last_webhook_received_at'
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      return json(
        {
          error:
            `Failed to read existing connection: ${existingError.message}`,
        },
        500
      );
    }

    const webhookSecret =
      existing?.webhook_secret ||
      generateWebhookSecret();

    const row = {
      user_id: user.id,
      encrypted_api_key: encryptedApiKey,
      webhook_secret: webhookSecret,
      fireflies_user_email:
        validation.email,
      status:
        existing?.last_webhook_received_at
          ? 'active'
          : 'pending',
      last_validated_at:
        new Date().toISOString(),
      last_error: null,
      updated_at:
        new Date().toISOString(),
    };

    if (existing) {
      const {
        error: updateError,
      } = await admin
        .from('fireflies_connections')
        .update(row)
        .eq('user_id', user.id);

      if (updateError) {
        return json(
          {
            error:
              `Failed to save Fireflies connection: ${updateError.message}`,
          },
          500
        );
      }
    } else {
      const {
        error: insertError,
      } = await admin
        .from('fireflies_connections')
        .insert(row);

      if (insertError) {
        return json(
          {
            error:
              `Failed to create Fireflies connection: ${insertError.message}`,
          },
          500
        );
      }
    }

    return json({
      ok: true,
      email: validation.email,
      webhook_url:
        `${SUPABASE_URL}/functions/v1/fireflies-webhook?user_id=${user.id}`,
      webhook_secret:
        shouldExposeWebhookSecret(
          row.status,
          existing?.last_webhook_received_at ?? null
        )
          ? webhookSecret
          : undefined,
    });
  } catch (error) {
    console.error(
      'fireflies-connect error:',
      error
    );

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      500
    );
  }
});