// Shared by fireflies-webhook and mobile-recording-review.
// Extracted from fireflies-webhook's post-call-review write-back block
// (deal_state upsert, stakeholders upsert, deals.risk_level update).
// Behavior is unchanged from the original inline version -- this is a
// straight extraction, not a rewrite. Keep both callers passing the same
// shape of `review` (the object returned by call-review's { review } body).
//
// Does NOT touch conversations or any source-specific table
// (scheduled_meetings for Fireflies, nothing yet for mobile) -- callers
// handle their own conversations insert and any source-specific bookkeeping
// before/after calling this.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mirrors getRiskLevel in src/lib/kairo.ts and the inlined copy that used
// to live in fireflies-webhook/index.ts. Kept in sync manually; check
// src/lib/kairo.ts together with this file when changing this mapping.
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

type Review = {
  deal: {
    status: string;
    confidence: string;
    health_score: number;
    highest_priority_risk: { risk: string; why_it_matters: string; evidence: string };
    what_youre_missing: unknown[];
    recommended_next_action: string;
    manager_note: string;
    status_reason: string;
  };
  supporting_evidence?: string[];
  stakeholder_signals?: Array<{
    name: string;
    role: string | null;
    sentiment: string | null;
    evidence: string;
  }>;
};

// Upserts deal_state, upserts each stakeholder signal, and updates
// deals.risk_level -- the exact sequence fireflies-webhook ran inline after
// a successful call-review response. Callers are responsible for inserting
// the conversations row themselves (the shape of that insert differs
// slightly by source -- e.g. input_type, audio_url -- so it isn't included
// here) and for handling their own errors; this throws on failures rather
// than swallowing them, matching the original block's behavior of logging
// and continuing where the original used try/catch at the call site.
export async function writeBackDealReview(
  supabase: SupabaseClient,
  dealId: string,
  userId: string,
  review: Review
): Promise<void> {
  const { data: existingState } = await supabase
    .from('deal_state')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle();

  const stateRow = {
    deal_id: dealId,
    user_id: userId,
    current_status: review.deal.status,
    confidence: review.deal.confidence,
    deal_health_score: review.deal.health_score,
    highest_priority_risk: review.deal.highest_priority_risk.risk,
    highest_priority_risk_full: review.deal.highest_priority_risk,
    what_youre_missing: review.deal.what_youre_missing,
    key_follow_up_message: review.deal.recommended_next_action,
    manager_note: review.deal.manager_note,
    supporting_evidence: review.supporting_evidence ?? [],
    last_review_summary: review.deal.status_reason,
    updated_at: new Date().toISOString(),
  };

  if (existingState) {
    await supabase.from('deal_state').update(stateRow).eq('id', existingState.id);
  } else {
    await supabase.from('deal_state').insert(stateRow);
  }

  if (Array.isArray(review.stakeholder_signals) && review.stakeholder_signals.length > 0) {
    for (const s of review.stakeholder_signals) {
      const { data: existingStakeholder } = await supabase
        .from('stakeholders')
        .select('id')
        .eq('deal_id', dealId)
        .eq('name', s.name)
        .maybeSingle();

      const stakeholderRow = {
        deal_id: dealId,
        user_id: userId,
        name: s.name,
        role: s.role,
        sentiment: s.sentiment,
        notes: s.evidence || null,
        updated_at: new Date().toISOString(),
      };

      if (existingStakeholder) {
        await supabase.from('stakeholders').update(stakeholderRow).eq('id', existingStakeholder.id);
      } else {
        await supabase.from('stakeholders').insert(stakeholderRow);
      }
    }
  }

  await supabase
    .from('deals')
    .update({
      risk_level: getRiskLevel(review.deal.status),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId);
}