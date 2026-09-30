import { Subscription } from '@kairo/core';
import { getKairoClient, KairoClient } from '../client';

export async function getSubscription(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<Subscription | null> {
  const { data, error } = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Subscription | null;
}
