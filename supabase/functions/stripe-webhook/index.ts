import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('stripe-webhook: Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return jsonRes({ error: 'Webhook secret is not configured' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonRes({ error: 'Missing stripe-signature header' }, 400);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`stripe-webhook: Signature verification failed: ${err.message}`);
    return jsonRes({ error: `Webhook signature verification failed: ${err.message}` }, 400);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    console.log(`stripe-webhook: Handling event ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.subscription_data?.metadata?.supabase_user_id ||
                       (session.metadata?.supabase_user_id as string | undefined);

        let periodEnd: string | null = null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if (sub.current_period_end) {
            periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }
        }

        if (userId) {
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            });
        } else if (customerId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              stripe_subscription_id: subscriptionId,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        let kairoStatus = 'active';
        if (sub.status === 'past_due') {
          kairoStatus = 'past_due';
        } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
          kairoStatus = 'canceled';
        } else if (sub.status === 'incomplete_expired') {
          kairoStatus = 'expired';
        } else if (sub.status === 'trialing') {
          kairoStatus = 'trialing';
        } else {
          kairoStatus = 'active';
        }

        await supabase
          .from('subscriptions')
          .update({
            status: kairoStatus,
            stripe_subscription_id: sub.id,
            current_period_end: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (customerId && invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (customerId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      default:
        console.log(`stripe-webhook: Unhandled event type ${event.type}`);
    }

    return jsonRes({ received: true });
  } catch (err: any) {
    console.error('stripe-webhook processing error:', err);
    return jsonRes({ error: err.message || 'Webhook handler error' }, 500);
  }
});
