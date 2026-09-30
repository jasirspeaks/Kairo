import { DealReview, Stakeholder } from '@kairo/core';
import { getKairoClient, KairoClient } from '../client';

export async function getStakeholders(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<Stakeholder[]> {
  const { data, error } = await client
    .from('stakeholders')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as Stakeholder[]) || [];
}

/**
 * Kept as a compatibility shim for existing call sites. Stakeholders are now
 * persisted by persist_deal_review() in the same database transaction as
 * deal_state/deals, so this must not issue a second independent write.
 */
export async function saveStakeholders(
  _dealId: string,
  _userId: string,
  _review: DealReview
): Promise<void> {
  return;
}
