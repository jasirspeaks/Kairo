/**
 * Auth error mapping + password strength helpers.
 *
 * We never surface raw Supabase/GoTrue error messages directly to the user.
 * The SDK's error text isn't part of any stability contract -- it can change
 * between versions, and some variants (rate-limit internals, provider-specific
 * detail) aren't things we want reflected back verbatim. Instead we map known
 * error codes/messages to our own copy, and fall back to one generic message
 * for anything we don't recognize.
 */

import { AuthError } from '@supabase/supabase-js';

/**
 * Map a Supabase auth error to safe, user-facing copy.
 * Falls back to a generic message for anything not explicitly handled.
 */
export function getAuthErrorMessage(error: AuthError | Error | null | undefined): string {
  if (!error) return '';

  const msg = error.message?.toLowerCase() ?? '';

  // Bad credentials on sign-in. Deliberately vague: don't reveal whether the
  // email exists, whether it's the password or the account that's wrong.
  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }

  // Sign-up with an email that already has an account. Supabase's own
  // behavior here varies by project config (some configs already suppress
  // this to prevent enumeration) -- keep our copy non-committal either way.
  if (msg.includes('user already registered') || msg.includes('already registered')) {
    return 'If that email can be used to sign up, you should receive a confirmation shortly. Otherwise, try signing in.';
  }

  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox for the confirmation link.';
  }

  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }

  if (msg.includes('password') && msg.includes('at least')) {
    return 'Password is too short. Please use at least 8 characters.';
  }

  if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }

  if (msg.includes('same password') || msg.includes('should be different')) {
    return 'New password must be different from your current password.';
  }

  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Generic fallback -- never echo error.message here.
  return 'Something went wrong. Please try again.';
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwertyui', 'letmein1', 'welcome1', 'admin123', 'iloveyou',
  'abc12345', '1q2w3e4r', 'passw0rd', 'football', 'monkey123',
]);

/**
 * Lightweight, dependency-free password strength check. This is a client-side
 * UX nudge, not a security boundary -- the real backstop is enabling
 * Supabase's leaked-password-protection (HaveIBeenPwned check) at the project
 * level, which this cannot replace.
 */
export function checkPasswordStrength(password: string): {
  strength: PasswordStrength;
  message: string;
  isAcceptable: boolean;
} {
  if (password.length < 8) {
    return { strength: 'weak', message: 'At least 8 characters required.', isAcceptable: false };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { strength: 'weak', message: 'This password is too common. Please choose another.', isAcceptable: false };
  }

  // Reject simple repeated-character or sequential patterns like "aaaaaaaa" or "12345678".
  const isAllSameChar = /^(.)\1+$/.test(password);
  const isSequential = /^(0123456789|1234567890|abcdefgh|qwertyui){1}/.test(password.toLowerCase());
  if (isAllSameChar || isSequential) {
    return { strength: 'weak', message: 'Please avoid repeated or sequential characters.', isAcceptable: false };
  }

  const varietyCount = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  if (password.length >= 12 && varietyCount >= 3) {
    return { strength: 'strong', message: 'Strong password.', isAcceptable: true };
  }

  if (password.length >= 10 && varietyCount >= 2) {
    return { strength: 'fair', message: 'Good. Adding a symbol or number makes it stronger.', isAcceptable: true };
  }

  if (varietyCount >= 2) {
    return { strength: 'fair', message: 'Acceptable, but a longer password with mixed characters is safer.', isAcceptable: true };
  }

  return { strength: 'weak', message: 'Try mixing letters, numbers, and symbols.', isAcceptable: true };
}