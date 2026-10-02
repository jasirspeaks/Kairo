import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_PRICE_ID = Deno.env.get('STRIPE_PRICE_ID');
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return jsonRes({ error: 'STRIPE_SECRET_KEY is not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonRes({ error: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const userClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return jsonRes({ error: 'Invalid or expired user session' }, 401);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Parse optional request body for custom return url or price
    let customPriceId = STRIPE_PRICE_ID;
    let customReturnUrl = APP_URL;
    try {
      if (req.headers.get('content-type')?.includes('application/json')) {
        const body = await req.json();
        if (body.price_id) customPriceId = body.price_id;
        if (body.return_url) customReturnUrl = body.return_url;
      }
    } catch {
      // Body is optional
    }

    if (!customPriceId) {
      return jsonRes({ error: 'STRIPE_PRICE_ID is not configured and no price_id was provided' }, 400);
    }

    // Retrieve or create Stripe customer
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      await supabase
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: {
        address: 'auto',
      },
      line_items: [
        {
          price: customPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${customReturnUrl}/app/settings?session_id={CHECKOUT_SESSION_ID}&checkout=success`,
      cancel_url: `${customReturnUrl}/app/settings?checkout=cancelled`,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
    });

    return jsonRes({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout-session error:', err);
    return jsonRes({ error: err.message || 'Internal server error' }, 500);
  }
});
