import React from 'react';
import { CreditCard, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { formatDate } from '../../../lib/utils';
import { Subscription } from '@kairo/core';

interface BillingSectionProps {
  subscription: Subscription | null;
  subscriptionLoading: boolean;
  trialDaysLeft: number | null;
  isExpired: boolean;
  upgrading: boolean;
  managingBilling: boolean;
  billingError: string;
  checkoutBanner: 'success' | 'cancelled' | null;
  highlightPlan: boolean;
  onUpgrade: () => void;
  onManageBilling: () => void;
}

export function BillingSection({
  subscription,
  subscriptionLoading,
  trialDaysLeft,
  isExpired,
  upgrading,
  managingBilling,
  billingError,
  checkoutBanner,
  highlightPlan,
  onUpgrade,
  onManageBilling,
}: BillingSectionProps) {
  return (
    <div className="space-y-6">
      <div
        className={`card p-5 md:p-6 transition-shadow duration-500 ${
          highlightPlan ? 'ring-2 ring-primary/50 shadow-purple-glow-sm' : ''
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-textPrimary">Subscription & License</h3>
        </div>
        <p className="text-textMuted text-xs mb-4">
          Manage your Kairo workspace tier, billing method, and payment receipts.
        </p>

        {checkoutBanner === 'success' && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg p-3 mb-4">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Thank you for upgrading! Your Pro subscription is now active.</span>
          </div>
        )}

        {checkoutBanner === 'cancelled' && (
          <div className="flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-medium rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Checkout was cancelled. You can upgrade anytime.</span>
          </div>
        )}

        {billingError && (
          <div className="flex items-center gap-2 bg-red-400/10 border border-red-400/20 text-red-400 text-xs font-medium rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{billingError}</span>
          </div>
        )}

        {subscriptionLoading ? (
          <div className="h-14 bg-surfaceHigh rounded-lg animate-pulse" />
        ) : !subscription ? (
          <p className="text-textMuted text-xs">
            Couldn&apos;t load your subscription status. Refresh the page or contact support.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Trialing */}
            {subscription.status === 'trialing' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-primary/10 border border-primary/25 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-glow flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-textPrimary text-xs font-semibold">
                      {trialDaysLeft === 0
                        ? 'Your trial ends today'
                        : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining in Pro trial`}
                    </p>
                    <p className="text-textSecondary text-xs mt-0.5">
                      Trial ends on {formatDate(subscription.trial_end)}. After that, adding new deals and call reviews pauses until upgraded.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={onUpgrade}
                  loading={upgrading}
                  size="sm"
                  className="sm:flex-shrink-0"
                >
                  Upgrade Early
                </Button>
              </div>
            )}

            {/* Active Pro */}
            {subscription.status === 'active' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-emerald-400 text-xs font-semibold">
                      Active Pro License
                    </p>
                    {subscription.current_period_end && (
                      <p className="text-textSecondary text-xs mt-0.5">
                        Renews on {formatDate(subscription.current_period_end)} via Stripe.
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onManageBilling}
                  loading={managingBilling}
                  className="sm:flex-shrink-0"
                >
                  Manage Billing & Invoices
                </Button>
              </div>
            )}

            {/* Expired */}
            {isExpired && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-400/10 border border-amber-400/20 rounded-lg p-4">
                <div>
                  <p className="text-textPrimary text-xs font-semibold">
                    Trial Period Expired
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    Your access has expired. Upgrade to continue creating deals and generating 5-pillar reviews.
                  </p>
                </div>

                <Button
                  onClick={onUpgrade}
                  loading={upgrading}
                  size="sm"
                  className="sm:flex-shrink-0"
                >
                  Upgrade to Pro
                </Button>
              </div>
            )}

            {/* Past Due */}
            {subscription.status === 'past_due' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-red-400/10 border border-red-400/20 rounded-lg p-4">
                <div>
                  <p className="text-red-400 text-xs font-semibold">
                    Subscription Payment Past Due
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    Please update your payment method to avoid service interruption.
                  </p>
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={onManageBilling}
                  loading={managingBilling}
                  className="sm:flex-shrink-0"
                >
                  Update Payment Method
                </Button>
              </div>
            )}

            {/* Canceled */}
            {subscription.status === 'canceled' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surfaceHigh border border-border rounded-lg p-4">
                <div>
                  <p className="text-textPrimary text-xs font-semibold">
                    Subscription Canceled
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    Your subscription is no longer active. You can reactivate anytime.
                  </p>
                </div>

                <Button
                  onClick={onUpgrade}
                  loading={upgrading}
                  size="sm"
                  className="sm:flex-shrink-0"
                >
                  Reactivate Pro
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
