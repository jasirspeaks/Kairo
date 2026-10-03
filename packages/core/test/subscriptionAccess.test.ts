import { describe, it, expect } from 'vitest';

interface SubscriptionRecord {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  trial_end: string;
}

function evaluateWriteAccess(subscription: SubscriptionRecord | null): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'trialing') {
    return new Date(subscription.trial_end).getTime() > Date.now();
  }
  return false;
}

describe('Subscription Write Access & Trial Evaluation', () => {
  it('allows scheduling / write access for valid active subscription', () => {
    const sub: SubscriptionRecord = {
      status: 'active',
      trial_end: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(true);
  });

  it('allows scheduling / write access for active trial with future trial_end', () => {
    const sub: SubscriptionRecord = {
      status: 'trialing',
      trial_end: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(true);
  });

  it('rejects write access for expired trial (trial_end in past)', () => {
    const sub: SubscriptionRecord = {
      status: 'trialing',
      trial_end: new Date(Date.now() - 1000 * 60).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(false);
  });

  it('rejects write access for expired status', () => {
    const sub: SubscriptionRecord = {
      status: 'expired',
      trial_end: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(false);
  });

  it('rejects write access for canceled status', () => {
    const sub: SubscriptionRecord = {
      status: 'canceled',
      trial_end: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(false);
  });

  it('rejects write access for past_due status', () => {
    const sub: SubscriptionRecord = {
      status: 'past_due',
      trial_end: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    };
    expect(evaluateWriteAccess(sub)).toBe(false);
  });

  it('rejects write access when no subscription record exists', () => {
    expect(evaluateWriteAccess(null)).toBe(false);
  });
});
