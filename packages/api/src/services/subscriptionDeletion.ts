/**
 * Subscription cancellation safety planner for account deletion.
 *
 * Deleting an account in Kairo drops public.subscriptions via Postgres ON DELETE CASCADE.
 * If the user has an active Stripe subscription, dropping the database row without canceling
 * in Stripe would cause Stripe to continue billing the customer indefinitely.
 *
 * This module models the cancellation decision matrix so the application handles
 * active subscriptions, idempotency, webhook races, and user consent cleanly.
 */

export type SubscriptionPolicy = 'auto_cancel' | 'block_active' | 'user_consented';

export interface SubscriptionRecord {
  status?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

export interface SubscriptionDeletionPlan {
  action: 'cancel_immediately' | 'allow_deletion' | 'block_deletion';
  shouldCallStripe: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  reason: string;
}

export function planSubscriptionDeletion(params: {
  subscription?: SubscriptionRecord | null;
  policy: SubscriptionPolicy;
  userConsented?: boolean;
}): SubscriptionDeletionPlan {
  const { subscription, policy, userConsented = false } = params;

  if (!subscription || !subscription.stripe_subscription_id) {
    return {
      action: 'allow_deletion',
      shouldCallStripe: false,
      reason: 'No external Stripe subscription found.',
    };
  }

  const isActiveOrTrialing =
    subscription.status === 'active' || subscription.status === 'trialing';

  if (!isActiveOrTrialing) {
    return {
      action: 'allow_deletion',
      shouldCallStripe: false,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      stripeCustomerId: subscription.stripe_customer_id || undefined,
      reason: `Subscription is already in terminal/non-billing status: ${subscription.status || 'unknown'}.`,
    };
  }

  switch (policy) {
    case 'block_active':
      return {
        action: 'block_deletion',
        shouldCallStripe: false,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        stripeCustomerId: subscription.stripe_customer_id || undefined,
        reason: 'Active subscription detected. User must cancel via billing portal prior to account deletion.',
      };

    case 'user_consented':
      if (!userConsented) {
        return {
          action: 'block_deletion',
          shouldCallStripe: false,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          stripeCustomerId: subscription.stripe_customer_id || undefined,
          reason: 'User has not confirmed immediate cancellation of their active paid subscription.',
        };
      }
      return {
        action: 'cancel_immediately',
        shouldCallStripe: true,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        stripeCustomerId: subscription.stripe_customer_id || undefined,
        reason: 'User explicitly confirmed cancellation and account deletion.',
      };

    case 'auto_cancel':
    default:
      return {
        action: 'cancel_immediately',
        shouldCallStripe: true,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        stripeCustomerId: subscription.stripe_customer_id || undefined,
        reason: 'Automatic cancellation on account deletion.',
      };
  }
}
