import { PlatformType } from '../types';

export const DEFAULT_DEEP_LINK_SCHEME = 'kairo';

/**
 * Returns the appropriate OAuth redirect URL based on client platform.
 *
 * Platforms:
 * - 'web': browser origin or fallback
 * - 'desktop': local Tauri dev port or production custom protocol
 * - 'ios' / 'android': native URI scheme (kairo://auth/callback)
 */
export function getAuthRedirectUrl(platform: PlatformType = 'web', origin?: string): string {
  switch (platform) {
    case 'ios':
    case 'android':
      return `${DEFAULT_DEEP_LINK_SCHEME}://auth/callback`;
    case 'desktop':
      return typeof window !== 'undefined' && window.location.origin.includes('localhost')
        ? 'http://localhost:1420/auth/callback'
        : 'tauri://localhost/auth/callback';
    case 'web':
    default:
      if (origin) return `${origin}/auth/callback`;
      if (typeof window !== 'undefined') return `${window.location.origin}/auth/callback`;
      return 'http://localhost:3000/auth/callback';
  }
}

/**
 * Returns the appropriate Google Calendar OAuth callback redirect URL.
 */
export function getCalendarRedirectUrl(platform: PlatformType = 'web', origin?: string): string {
  switch (platform) {
    case 'ios':
    case 'android':
      return `${DEFAULT_DEEP_LINK_SCHEME}://calendar/callback`;
    case 'desktop':
      return typeof window !== 'undefined' && window.location.origin.includes('localhost')
        ? 'http://localhost:1420/app/settings?calendar=connected'
        : 'tauri://localhost/app/settings?calendar=connected';
    case 'web':
    default:
      if (origin) return `${origin}/app/settings?calendar=connected`;
      if (typeof window !== 'undefined') return `${window.location.origin}/app/settings?calendar=connected`;
      return 'http://localhost:3000/app/settings?calendar=connected';
  }
}

/**
 * Returns the appropriate Password Reset callback redirect URL based on client platform.
 */
export function getResetPasswordRedirectUrl(platform: PlatformType = 'web', origin?: string): string {
  switch (platform) {
    case 'ios':
    case 'android':
      return `${DEFAULT_DEEP_LINK_SCHEME}://auth/reset-password`;
    case 'desktop':
      return typeof window !== 'undefined' && window.location.origin.includes('localhost')
        ? 'http://localhost:1420/auth/reset-password'
        : 'tauri://localhost/auth/reset-password';
    case 'web':
    default:
      if (origin) return `${origin}/auth/reset-password`;
      if (typeof window !== 'undefined') return `${window.location.origin}/auth/reset-password`;
      return 'http://localhost:3000/auth/reset-password';
  }
}

/**
 * Parses query and hash fragment parameters from incoming deep link URLs.
 */
export function parseDeepLinkUrl(urlString: string): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    const parsed = new URL(urlString);

    // Parse search query params (?code=...&error=...)
    parsed.searchParams.forEach((val, key) => {
      result[key] = val;
    });

    // Parse hash fragment params (#access_token=...&refresh_token=...)
    if (parsed.hash && parsed.hash.length > 1) {
      const hashQuery = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.forEach((val, key) => {
        result[key] = val;
      });
    }
  } catch {
    // Return whatever was parsed
  }

  return result;
}
