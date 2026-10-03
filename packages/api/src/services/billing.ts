import { getClientConfig, getKairoClient, KairoClient } from '../client';

export interface CheckoutSessionOptions {
  priceId?: string;
  returnUrl?: string;
}

export interface CustomerPortalSessionOptions {
  returnUrl?: string;
}

/**
 * Initiates Stripe Checkout to upgrade the user's subscription.
 */
export async function createCheckoutSession(
  options: CheckoutSessionOptions = {},
  client: KairoClient = getKairoClient()
): Promise<{ url: string }> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to upgrade your subscription.');
  }

  const { supabaseUrl, supabaseAnonKey } = getClientConfig();
  const endpoint = `${supabaseUrl}/functions/v1/create-checkout-session`;
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://kairo.internal';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      price_id: options.priceId,
      return_url: options.returnUrl || fallbackOrigin,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || `Failed to create checkout session (${res.status})`);
  }

  return { url: data.url };
}

/**
 * Creates a Stripe Customer Portal session for billing management (cards, invoices, cancel).
 */
export async function createCustomerPortalSession(
  options: CustomerPortalSessionOptions = {},
  client: KairoClient = getKairoClient()
): Promise<{ url: string }> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to manage your subscription.');
  }

  const { supabaseUrl, supabaseAnonKey } = getClientConfig();
  const endpoint = `${supabaseUrl}/functions/v1/create-portal-session`;
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://kairo.internal';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      return_url: options.returnUrl || `${fallbackOrigin}/app/settings`,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || `Failed to create customer portal session (${res.status})`);
  }

  return { url: data.url };
}
