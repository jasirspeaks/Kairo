import {
  Deal,
  DealLifecycle,
  DealReview,
  DealStage,
  DealState,
  resolveDealStage,
} from '@kairo/core';
import { getKairoClient, KairoClient } from '../client';

export interface DealWithState extends Deal {
  deal_state: DealState | null;
}

export async function getDeals(
  userId: string,
  lifecycle: DealLifecycle = 'active',
  client: KairoClient = getKairoClient()
): Promise<Deal[]> {
  const { data, error } = await client
    .from('deals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', lifecycle)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as Deal[]) || [];
}

export async function getDeal(
  dealId: string,
  userId?: string,
  client: KairoClient = getKairoClient()
): Promise<Deal | null> {
  let query = client.from('deals').select('*').eq('id', dealId);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as Deal | null;
}

export async function getDealState(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<DealState | null> {
  const { data, error } = await client
    .from('deal_state')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle();

  if (error) throw error;
  return data as DealState | null;
}

/**
 * Optimized dashboard fetch: retrieves active deals and their deal_state
 * using a batched IN() query rather than N sequential round-trips.
 */
export async function getDashboardDeals(
  userId: string,
  client: KairoClient = getKairoClient()
): Promise<DealWithState[]> {
  const { data: dealsData, error: dealsError } = await client
    .from('deals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (dealsError) throw dealsError;
  if (!dealsData || dealsData.length === 0) return [];

  const dealIds = dealsData.map((d) => d.id);

  // Single batched query for all deal_state records
  const { data: statesData, error: statesError } = await client
    .from('deal_state')
    .select('*')
    .in('deal_id', dealIds);

  if (statesError) throw statesError;

  const stateMap = new Map<string, DealState>();
  (statesData || []).forEach((state: DealState) => {
    stateMap.set(state.deal_id, state);
  });

  const dealsWithState: DealWithState[] = dealsData.map((deal) => ({
    ...deal,
    deal_state: stateMap.get(deal.id) || null,
  }));

  // Return all active deals that are not closed Won/Lost.
  // Deals awaiting first review (deal_state === null) are preserved as active/Unknown.
  return dealsWithState.filter(
    (d) =>
      !d.deal_state ||
      (d.deal_state.current_status !== 'Won' && d.deal_state.current_status !== 'Lost')
  );
}

export async function createDeal(
  deal: Partial<Deal> & { deal_name: string; company_name: string; user_id: string },
  client: KairoClient = getKairoClient()
): Promise<Deal> {
  const { data, error } = await client
    .from('deals')
    .insert(deal)
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function updateDeal(
  dealId: string,
  updates: Partial<Deal>,
  client: KairoClient = getKairoClient()
): Promise<Deal> {
  const { data, error } = await client
    .from('deals')
    .update(updates)
    .eq('id', dealId)
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function deleteDeal(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  const { error } = await client.from('deals').delete().eq('id', dealId);
  if (error) throw error;
}

export async function saveDealState(
  dealId: string,
  userId: string,
  review: DealReview,
  resolvedStage?: DealStage,
  client: KairoClient = getKairoClient()
): Promise<void> {
  let stage = resolvedStage;

  if (!stage) {
    const { data: deal, error: dealError } = await client
      .from('deals')
      .select('deal_stage')
      .eq('id', dealId)
      .eq('user_id', userId)
      .maybeSingle();

    if (dealError) {
      throw new Error(`Failed to read deal stage: ${dealError.message}`);
    }
    if (!deal) {
      throw new Error('Deal not found.');
    }

    stage = resolveDealStage(deal.deal_stage, review);
  }

  const { error } = await client.rpc('persist_deal_review', {
    p_deal_id: dealId,
    p_user_id: userId,
    p_review: review,
    p_resolved_stage: stage,
  });

  if (error) {
    throw new Error(`Failed to persist deal review: ${error.message}`);
  }
}
