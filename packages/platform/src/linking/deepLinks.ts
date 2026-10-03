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
      return `${DEFAULT_DEEP_LINK_SCHEME}://auth/callback`;
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
      return `${DEFAULT_DEEP_LINK_SCHEME}://calendar/callback`;
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
        ? 'http://localhost:1420/reset-password'
        : 'tauri://localhost/reset-password';
    case 'web':
    default:
      if (origin) return `${origin}/reset-password`;
      if (typeof window !== 'undefined') return `${window.location.origin}/reset-password`;
      return `${DEFAULT_DEEP_LINK_SCHEME}://auth/reset-password`;
  }
}

/**
 * Parses query and hash fragment parameters from incoming deep link URLs.
 */
export function parseDeepLinkUrl(urlString: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!urlString) return result;

  try {
    const queryIndex = urlString.indexOf('?');
    const hashIndex = urlString.indexOf('#');

    let queryString = '';
    let hashString = '';

    if (queryIndex !== -1) {
      const end = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : urlString.length;
      queryString = urlString.slice(queryIndex + 1, end);
    }

    if (hashIndex !== -1) {
      hashString = urlString.slice(hashIndex + 1);
    }

    if (queryString) {
      const queryParams = new URLSearchParams(queryString);
      queryParams.forEach((val, key) => {
        result[key] = val;
      });
    }

    if (hashString) {
      const hashParams = new URLSearchParams(hashString);
      hashParams.forEach((val, key) => {
        result[key] = val;
      });
    }
  } catch {
    // Fallback regex parsing if URLSearchParams fails
    const regex = /[?&#]([^=#]+)=([^&#]*)/g;
    let match;
    while ((match = regex.exec(urlString)) !== null) {
      try {
        result[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);
      } catch {
        result[match[1]] = match[2];
      }
    }
  }

  return result;
}
