import { describe, it, expect } from 'vitest';
import { planSubscriptionDeletion } from '../src/services/subscriptionDeletion';

describe('planSubscriptionDeletion', () => {
  it('allows deletion immediately if no subscription row exists', () => {
    const plan = planSubscriptionDeletion({
      subscription: null,
      policy: 'auto_cancel',
    });

    expect(plan.action).toBe('allow_deletion');
    expect(plan.shouldCallStripe).toBe(false);
  });

  it('allows deletion immediately if subscription has no stripe_subscription_id', () => {
    const plan = planSubscriptionDeletion({
      subscription: { status: 'free', stripe_subscription_id: null },
      policy: 'auto_cancel',
    });

    expect(plan.action).toBe('allow_deletion');
    expect(plan.shouldCallStripe).toBe(false);
  });

  it('allows deletion without calling Stripe if subscription is already canceled or past due', () => {
    const plan = planSubscriptionDeletion({
      subscription: {
        status: 'canceled',
        stripe_subscription_id: 'sub_already_dead',
        stripe_customer_id: 'cus_123',
      },
      policy: 'auto_cancel',
    });

    expect(plan.action).toBe('allow_deletion');
    expect(plan.shouldCallStripe).toBe(false);
    expect(plan.reason).toContain('terminal');
  });

  it('auto_cancel policy plans Stripe cancellation for active subscription', () => {
    const plan = planSubscriptionDeletion({
      subscription: {
        status: 'active',
        stripe_subscription_id: 'sub_live_123',
        stripe_customer_id: 'cus_123',
      },
      policy: 'auto_cancel',
    });

    expect(plan.action).toBe('cancel_immediately');
    expect(plan.shouldCallStripe).toBe(true);
    expect(plan.stripeSubscriptionId).toBe('sub_live_123');
  });

  it('block_active policy blocks deletion when active subscription exists', () => {
    const plan = planSubscriptionDeletion({
      subscription: {
        status: 'active',
        stripe_subscription_id: 'sub_live_123',
        stripe_customer_id: 'cus_123',
      },
      policy: 'block_active',
    });

    expect(plan.action).toBe('block_deletion');
    expect(plan.shouldCallStripe).toBe(false);
    expect(plan.reason).toContain('Active subscription detected');
  });

  it('user_consented policy blocks deletion when consent is missing', () => {
    const plan = planSubscriptionDeletion({
      subscription: {
        status: 'active',
        stripe_subscription_id: 'sub_live_123',
        stripe_customer_id: 'cus_123',
      },
      policy: 'user_consented',
      userConsented: false,
    });

    expect(plan.action).toBe('block_deletion');
    expect(plan.shouldCallStripe).toBe(false);
  });

  it('user_consented policy triggers cancellation when user consents', () => {
    const plan = planSubscriptionDeletion({
      subscription: {
        status: 'active',
        stripe_subscription_id: 'sub_live_123',
        stripe_customer_id: 'cus_123',
      },
      policy: 'user_consented',
      userConsented: true,
    });

    expect(plan.action).toBe('cancel_immediately');
    expect(plan.shouldCallStripe).toBe(true);
    expect(plan.stripeSubscriptionId).toBe('sub_live_123');
  });
});
