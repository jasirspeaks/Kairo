import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL');

const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY');

const GOOGLE_CLIENT_ID =
  Deno.env.get('GOOGLE_CLIENT_ID');

const GOOGLE_REDIRECT_URI =
  Deno.env.get('GOOGLE_REDIRECT_URI');

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'GET, POST, DELETE, OPTIONS',
};

async function signState(
  userId: string
): Promise<string> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured'
    );
  }

  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(
        SUPABASE_SERVICE_ROLE_KEY
      ),
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

  const issuedAt =
    Date.now().toString();

  const payload =
    `${userId}.${issuedAt}`;

  const mac =
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(
        payload
      )
    );

  const signature =
    Array.from(
      new Uint8Array(mac)
    )
      .map((byte) =>
        byte.toString(16).padStart(2, '0')
      )
      .join('');

  return `${payload}.${signature}`;
}

async function revokeGoogleToken(
  token: string
): Promise<boolean> {
  try {
    const response =
      await fetch(
        'https://oauth2.googleapis.com/revoke',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
          body:
            `token=${encodeURIComponent(token)}`,
        }
      );

    if (!response.ok) {
      console.error(
        `google-calendar-connect: Google revoke returned ${response.status}`
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      'google-calendar-connect: Google revoke failed:',
      error
    );

    return false;
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
        'Content-Type':
          'application/json',
      },
    }
  );
}

serve(async (req) => {
  // This is essential for browser requests
  // using Authorization + DELETE/POST.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (
    !['GET', 'POST', 'DELETE'].includes(
      req.method
    )
  ) {
    return json(
      {
        error: 'Method not allowed',
      },
      405
    );
  }

  const missing: string[] = [];

  if (!SUPABASE_URL)
    missing.push('SUPABASE_URL');

  if (!SUPABASE_ANON_KEY)
    missing.push(
      'SUPABASE_ANON_KEY'
    );

  if (!GOOGLE_CLIENT_ID)
    missing.push(
      'GOOGLE_CLIENT_ID'
    );

  if (!GOOGLE_REDIRECT_URI)
    missing.push(
      'GOOGLE_REDIRECT_URI'
    );

  if (!SUPABASE_SERVICE_ROLE_KEY)
    missing.push(
      'SUPABASE_SERVICE_ROLE_KEY'
    );

  if (missing.length) {
    console.error(
      'google-calendar-connect: missing environment variables:',
      missing
    );

    return json(
      {
        error:
          `Google Calendar is not configured: ${missing.join(', ')}`,
      },
      500
    );
  }

  try {
    const authorization =
      req.headers.get(
        'Authorization'
      );

    if (!authorization) {
      return json(
        {
          error: 'Unauthorized',
        },
        401
      );
    }

    const token =
      authorization.replace(
        /^Bearer\s+/i,
        ''
      );

    if (!token) {
      return json(
        {
          error: 'Unauthorized',
        },
        401
      );
    }

    const userClient =
      createClient(
        SUPABASE_URL!,
        SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        }
      );

    const {
      data: { user },
      error: authError,
    } =
      await userClient.auth.getUser(
        token
      );

    if (authError || !user) {
      return json(
        {
          error: 'Unauthorized',
        },
        401
      );
    }

    const admin =
      createClient(
        SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY!
      );

    // ------------------------------------------------------------
    // DISCONNECT
    // ------------------------------------------------------------

    if (req.method === 'DELETE') {
      const {
        data: connection,
        error: readError,
      } = await admin
        .from('calendar_connections')
        .select(
          'id, access_token, refresh_token'
        )
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (readError) {
        return json(
          {
            error:
              `Failed to read calendar connection: ${readError.message}`,
          },
          500
        );
      }

      let googleRevoked = true;

      if (connection) {
        const tokenToRevoke =
          connection.refresh_token ||
          connection.access_token;

        if (tokenToRevoke) {
          googleRevoked =
            await revokeGoogleToken(
              tokenToRevoke
            );
        }

        const {
          error: deleteError,
        } = await admin
          .from('calendar_connections')
          .delete()
          .eq('id', connection.id)
          .eq('user_id', user.id);

        if (deleteError) {
          return json(
            {
              error:
                `Failed to disconnect calendar: ${deleteError.message}`,
            },
            500
          );
        }
      }

      return json({
        ok: true,
        status: 'disconnected',
        google_revoked:
          googleRevoked,
      });
    }

    // ------------------------------------------------------------
    // CONNECT
    // ------------------------------------------------------------

    const state =
      await signState(user.id);

    const params =
      new URLSearchParams({
        client_id:
          GOOGLE_CLIENT_ID!,
        redirect_uri:
          GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope:
          'https://www.googleapis.com/auth/calendar.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

    return json({
      ok: true,
      auth_url:
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  } catch (error) {
    console.error(
      'google-calendar-connect error:',
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