// Used by mobile-recording-review.
//
// Deal review persistence is delegated to one Postgres RPC so deal_state,
// stakeholders, deal stage, risk level, and lifecycle change in one transaction.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getRiskLevel(status: string): 'high' | 'medium' | 'low' | 'none' {
  switch (status) {
    case 'Critical':
    case 'At Risk':
      return 'high';
    case 'Stalled':
    case 'Recovering':
      return 'medium';
    case 'Healthy':
    case 'Promising':
    case 'Won':
      return 'low';
    case 'Lost':
    case 'Unknown':
    default:
      return 'none';
  }
}

const DEAL_STAGE_ORDER = [
  'Qualification',
  'Discovery',
  'Demo',
  'Evaluation',
  'Alignment',
  'Proposal',
  'Negotiation',
  'Procurement',
  'Decision',
];

export function resolveDealStageServer(currentStage: string, review: Review): string {
  if (review.deal.status === 'Won') return 'Closed Won';
  if (review.deal.status === 'Lost') return 'Closed Lost';

  const suggested = review.deal.suggested_deal_stage;
  if (!suggested) return currentStage;

  if (review.deal.stage_regression_override) return suggested;

  const currentIndex = DEAL_STAGE_ORDER.indexOf(currentStage);
  const suggestedIndex = DEAL_STAGE_ORDER.indexOf(suggested);

  if (currentIndex === -1 || suggestedIndex === -1) return currentStage;
  return suggestedIndex >= currentIndex ? suggested : currentStage;
}

export type Review = {
  deal: {
    status: string;
    confidence: string;
    health_score: number;
    highest_priority_risk: { risk: string; why_it_matters: string; evidence: string };
    what_youre_missing: unknown[];
    recommended_next_action: string;
    manager_note: string;
    status_reason: string;
    pillars?: unknown;
    suggested_deal_stage?: string;
    stage_regression_override?: boolean;
  };
  supporting_evidence?: string[];
  stakeholder_signals?: Array<{
    name: string;
    role: string | null;
    sentiment: string | null;
    evidence: string;
  }>;
};

export async function writeBackDealReview(
  supabase: SupabaseClient,
  dealId: string,
  userId: string,
  review: Review
): Promise<void> {
  const { data: dealRow, error: dealReadError } = await supabase
    .from('deals')
    .select('deal_stage')
    .eq('id', dealId)
    .eq('user_id', userId)
    .maybeSingle();

  if (dealReadError) {
    throw new Error(`Failed to read deal stage: ${dealReadError.message}`);
  }
  if (!dealRow) throw new Error('Deal not found');

  const resolvedStage = resolveDealStageServer(dealRow.deal_stage, review);

  const { error } = await supabase.rpc('persist_deal_review', {
    p_deal_id: dealId,
    p_user_id: userId,
    p_review: review,
    p_resolved_stage: resolvedStage,
  });

  if (error) {
    throw new Error(`Failed to persist deal review: ${error.message}`);
  }
}
