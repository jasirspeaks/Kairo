import React, { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget, wired to fire onVerify(token) once solved.
 *
 * This is a NO-OP until VITE_TURNSTILE_SITE_KEY is set in your environment:
 * if the key is absent, the component renders nothing and immediately calls
 * onVerify('') so sign-up/sign-in flows are unaffected. This lets the code
 * ship now without breaking auth before you've created a Turnstile site key
 * (dashboard.cloudflare.com -> Turnstile) and wired it server-side.
 *
 * Once you have a site key:
 * 1. Add REACT_APP_TURNSTILE_SITE_KEY=<key> to your .env (this project uses
 *    Create React App / react-scripts, which only exposes vars prefixed
 *    REACT_APP_ to the client bundle -- not Vite's import.meta.env).
 * 2. Verify the token server-side (Supabase Auth has native Turnstile support:
 *    Auth -> Settings -> Bot and Abuse Protection -> enable Turnstile with
 *    your secret key). Supabase then validates the captchaToken you pass into
 *    signUp/signInWithPassword automatically -- no custom edge function needed.
 * 3. Pass the resulting token as { options: { captchaToken: token } } in the
 *    signUp / signInWithPassword calls in SignUp.tsx / SignIn.tsx (already
 *    wired in this codebase -- it's a no-op until the token is non-empty).
 */

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface CaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export function Captcha({ onVerify, onExpire }: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) {
      // No site key configured yet -- treat captcha as disabled, don't block auth.
      onVerify('');
      return;
    }

    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token: string) => onVerify(token),
        'expired-callback': () => {
          onVerify('');
          onExpire?.();
        },
        'error-callback': () => onVerify(''),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (!existing) {
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = render;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', render);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center my-2" />;
}