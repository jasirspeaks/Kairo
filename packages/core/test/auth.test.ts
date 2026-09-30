import { describe, it, expect } from 'vitest';
import {
  checkPasswordStrength,
  getAuthErrorMessage,
} from '../src';

describe('Domain Auth Logic - checkPasswordStrength', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const res = checkPasswordStrength('abc');
    expect(res.isAcceptable).toBe(false);
    expect(res.strength).toBe('weak');
  });

  it('rejects common dictionary passwords', () => {
    const res = checkPasswordStrength('password123');
    expect(res.isAcceptable).toBe(false);
    expect(res.strength).toBe('weak');
  });

  it('rejects repeated character passwords', () => {
    const res = checkPasswordStrength('aaaaaaaa');
    expect(res.isAcceptable).toBe(false);
    expect(res.strength).toBe('weak');
  });

  it('accepts fair strength passwords', () => {
    const res = checkPasswordStrength('MyPassw0rd');
    expect(res.isAcceptable).toBe(true);
    expect(['fair', 'strong']).toContain(res.strength);
  });

  it('scores strong complex passwords with strong rating', () => {
    const res = checkPasswordStrength('Secure#Pass2026!');
    expect(res.isAcceptable).toBe(true);
    expect(res.strength).toBe('strong');
  });
});

describe('Domain Auth Logic - getAuthErrorMessage', () => {
  it('maps invalid login credentials to safe message', () => {
    const msg = getAuthErrorMessage({ message: 'Invalid login credentials' });
    expect(msg).toBe('Incorrect email or password.');
  });

  it('maps rate limit messages to wait message', () => {
    const msg = getAuthErrorMessage({ message: 'Rate limit exceeded' });
    expect(msg).toBe('Too many attempts. Please wait a few minutes and try again.');
  });

  it('maps network errors safely', () => {
    const msg = getAuthErrorMessage({ message: 'Failed to fetch network' });
    expect(msg).toBe('Network error. Please check your connection and try again.');
  });

  it('falls back to generic error message for unknown errors', () => {
    const msg = getAuthErrorMessage({ message: 'Unknown internal code 500' });
    expect(msg).toBe('Something went wrong. Please try again.');
  });
});
