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
  status: 'connected' | 'error',
  platform: 'web' | 'mobile' = 'web'
): Response {
  if (platform === 'mobile') {
    return Response.redirect(
      `kairo://calendar/callback?calendar=${status}`,
      302
    );
  }

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
): Promise<{ userId: string; platform: 'web' | 'mobile' } | null> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const parts = state.split('.');

  let userId: string;
  let issuedAtStr: string;
  let platform: 'web' | 'mobile' = 'web';
  let sigHex: string;
  let payload: string;

  if (parts.length === 3) {
    [userId, issuedAtStr, sigHex] = parts;
    payload = `${userId}.${issuedAtStr}`;
  } else if (parts.length === 4) {
    let platformPart: string;
    [userId, issuedAtStr, platformPart, sigHex] = parts;
    if (platformPart !== 'mobile') {
      return null;
    }
    platform = 'mobile';
    payload = `${userId}.${issuedAtStr}.${platformPart}`;
  } else {
    return null;
  }

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

  return { userId, platform };
}

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response(
      'Method not allowed',
      { status: 405 }
    );
  }

  const url = new URL(req.url);

  const code =
    url.searchParams.get('code');

  const state =
    url.searchParams.get('state');

  const oauthError =
    url.searchParams.get('error');

  // Verify state early to determine target platform (web vs mobile)
  const verifiedState =
    state ? await verifyState(state) : null;

  const targetPlatform: 'web' | 'mobile' =
    verifiedState?.platform ||
    (state && state.split('.').length === 4 && state.split('.')[2] === 'mobile'
      ? 'mobile'
      : 'web');

  // APP_URL is needed for web redirects.
  if (!APP_URL && targetPlatform === 'web') {
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
      'error',
      targetPlatform
    );
  }

  if (
    oauthError ||
    !code ||
    !state ||
    !verifiedState
  ) {
    console.error(
      'google-calendar-callback: OAuth returned an error, missing parameters, or invalid state.',
      oauthError || 'missing or invalid parameters'
    );

    return redirectToSettings(
      'error',
      targetPlatform
    );
  }

  const { userId } = verifiedState;

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
        'error',
        targetPlatform
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
        'error',
        targetPlatform
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
        'error',
        targetPlatform
      );
    }

    return redirectToSettings(
      'connected',
      targetPlatform
    );
  } catch (err) {
    console.error(
      'google-calendar-callback error:',
      err instanceof Error
        ? err.message
        : 'Unknown error'
    );

    return redirectToSettings(
      'error',
      targetPlatform
    );
  }
});