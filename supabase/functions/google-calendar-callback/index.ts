import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get(
  'GOOGLE_CLIENT_SECRET'
);
const GOOGLE_REDIRECT_URI = Deno.env.get(
  'GOOGLE_REDIRECT_URI'
);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  'SUPABASE_SERVICE_ROLE_KEY'
);
const APP_URL = Deno.env.get('APP_URL');

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToSettings(
  status: 'connected' | 'error'
): Response {
  if (!APP_URL) {
    console.error(
      'google-calendar-callback: APP_URL is not configured.'
    );

    return new Response(
      'Google Calendar callback is not configured correctly.',
      { status: 500 }
    );
  }

  return Response.redirect(
    `${APP_URL}/app/settings?calendar=${status}`,
    302
  );
}

async function verifyState(
  state: string
): Promise<string | null> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const parts = state.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [
    userId,
    issuedAtStr,
    sigHex,
  ] = parts;

  const issuedAt = Number(
    issuedAtStr
  );

  if (
    !userId ||
    !issuedAtStr ||
    !sigHex ||
    Number.isNaN(issuedAt)
  ) {
    return null;
  }

  const now = Date.now();

  // Reject expired AND implausibly future-issued states.
  if (
    issuedAt > now + 30_000 ||
    now - issuedAt > STATE_MAX_AGE_MS
  ) {
    return null;
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

  const payload = `${userId}.${issuedAtStr}`;

  const mac =
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(
        payload
      )
    );

  const expectedSigHex =
    Array.from(
      new Uint8Array(mac)
    )
      .map((b) =>
        b.toString(16).padStart(2, '0')
      )
      .join('');

  if (
    expectedSigHex.length !==
    sigHex.length
  ) {
    return null;
  }

  let diff = 0;

  for (
    let i = 0;
    i < expectedSigHex.length;
    i++
  ) {
    diff |=
      expectedSigHex.charCodeAt(i) ^
      sigHex.charCodeAt(i);
  }

  if (diff !== 0) {
    return null;
  }

  return userId;
}

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response(
      'Method not allowed',
      { status: 405 }
    );
  }

  // APP_URL is needed even for error redirects.
  if (!APP_URL) {
    console.error(
      'google-calendar-callback: APP_URL is not set.'
    );

    return new Response(
      'Google Calendar callback is not configured correctly.',
      { status: 500 }
    );
  }

  // All of these are required before token exchange.
  const missing: string[] = [];

  if (!GOOGLE_CLIENT_ID) {
    missing.push('GOOGLE_CLIENT_ID');
  }

  if (!GOOGLE_CLIENT_SECRET) {
    missing.push('GOOGLE_CLIENT_SECRET');
  }

  if (!GOOGLE_REDIRECT_URI) {
    missing.push('GOOGLE_REDIRECT_URI');
  }

  if (!SUPABASE_URL) {
    missing.push('SUPABASE_URL');
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    missing.push(
      'SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  if (missing.length > 0) {
    console.error(
      'google-calendar-callback: missing environment variables:',
      missing.join(', ')
    );

    return redirectToSettings(
      'error'
    );
  }

  const url = new URL(req.url);

  const code =
    url.searchParams.get('code');

  const state =
    url.searchParams.get('state');

  const oauthError =
    url.searchParams.get('error');

  if (
    oauthError ||
    !code ||
    !state
  ) {
    console.error(
      'google-calendar-callback: OAuth returned an error or missing code/state.',
      oauthError || 'missing parameters'
    );

    return redirectToSettings(
      'error'
    );
  }

  const userId =
    await verifyState(state);

  if (!userId) {
    console.error(
      'google-calendar-callback: state verification failed.'
    );

    return redirectToSettings(
      'error'
    );
  }

  try {
    const tokenRes =
      await fetch(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code,
            client_id:
              GOOGLE_CLIENT_ID,
            client_secret:
              GOOGLE_CLIENT_SECRET,
            redirect_uri:
              GOOGLE_REDIRECT_URI,
            grant_type:
              'authorization_code',
          }),
        }
      );

    let tokenData: any = {};

    try {
      tokenData =
        await tokenRes.json();
    } catch {
      tokenData = {};
    }

    if (!tokenRes.ok) {
      console.error(
        'Google token exchange failed:',
        {
          status:
            tokenRes.status,
          error:
            tokenData?.error,
          error_description:
            tokenData?.error_description,
        }
      );

      return redirectToSettings(
        'error'
      );
    }

    if (
      !tokenData.access_token ||
      !tokenData.expires_in
    ) {
      console.error(
        'Google token exchange returned an incomplete token response.'
      );

      return redirectToSettings(
        'error'
      );
    }

    const expiresAt =
      new Date(
        Date.now() +
          Number(
            tokenData.expires_in
          ) *
            1000
      ).toISOString();

    const supabase =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );

    const {
      error: upsertError,
    } = await supabase
      .from('calendar_connections')
      .upsert(
        {
          user_id: userId,
          provider: 'google',
          access_token:
            tokenData.access_token,

          // Google only returns a refresh
          // token under certain consent
          // conditions. Preserve the old
          // one when Google omits it.
          ...(tokenData.refresh_token
            ? {
                refresh_token:
                  tokenData.refresh_token,
              }
            : {}),

          token_expires_at:
            expiresAt,
          scope:
            tokenData.scope,
          needs_reconnect:
            false,
          calendar_id:
            'primary',
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            'user_id,provider',
        }
      );

    if (upsertError) {
      console.error(
        'calendar_connections upsert error:',
        upsertError.message
      );

      return redirectToSettings(
        'error'
      );
    }

    return redirectToSettings(
      'connected'
    );
  } catch (err) {
    console.error(
      'google-calendar-callback error:',
      err instanceof Error
        ? err.message
        : 'Unknown error'
    );

    return redirectToSettings(
      'error'
    );
  }
});