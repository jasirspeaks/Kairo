// Shared by fireflies-webhook and mobile-recording-review.
// Extracted from fireflies-webhook's post-call-review write-back block
// (deal_state upsert, stakeholders upsert, deals.risk_level update).
// Behavior is unchanged from the original inline version for everything
// except deal_stage -- this file now also resolves and writes deal_stage,
// which the original inline block never touched (there was no stage
// picker on the webhook/mobile paths to begin with, so deal_stage on
// those deals simply never moved after creation until now).
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

// Deal Stage progression order -- mirrors DEAL_STAGES in
// src/types/index.ts. Kept in sync manually; check that file together with
// this one when the stage list changes. Closed Won/Closed Lost are
// deliberately excluded -- they're a terminal state derived from
// deal.status, never a point on this forward-progression scale.
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

// Server-side mirror of resolveDealStage in src/lib/kairo.ts. Cannot share
// code with it (this runs in Deno; that runs in the browser bundle), so
// the advance-only / regression-override logic below MUST be kept
// identical to that function's. If you change one, change the other in
// the same commit.
//
// Rules, in order:
//   1. Explicit Won/Lost always promotes to the matching Closed stage.
//   2. A rare, explicit stage_regression_override lets the AI move the
//      deal backward -- the only path that can do so.
//   3. Otherwise advance-or-hold only: suggested_deal_stage is applied
//      only if it's at or beyond the deal's current stage in
//      DEAL_STAGE_ORDER; a suggestion behind the current stage is ignored.
//   4. If suggested_deal_stage is missing (older review, pre-feature),
//      the current stage stands untouched.
function resolveDealStageServer(currentStage: string, review: Review): string {
  if (review.deal.status === 'Won') return 'Closed Won';
  if (review.deal.status === 'Lost') return 'Closed Lost';

  const suggested = review.deal.suggested_deal_stage;
  if (!suggested) return currentStage;

  if (review.deal.stage_regression_override) {
    return suggested;
  }

  const currentIndex = DEAL_STAGE_ORDER.indexOf(currentStage);
  const suggestedIndex = DEAL_STAGE_ORDER.indexOf(suggested);

  if (currentIndex === -1 || suggestedIndex === -1) return currentStage;

  return suggestedIndex >= currentIndex ? suggested : currentStage;
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

// Upserts deal_state, upserts each stakeholder signal, resolves and writes
// deal_stage, and updates deals.risk_level -- the exact sequence
// fireflies-webhook ran inline after a successful call-review response,
// now with deal_stage resolution added. Callers are responsible for
// inserting the conversations row themselves (the shape of that insert
// differs slightly by source -- e.g. input_type, audio_url -- so it isn't
// included here) and for handling their own errors; this throws on
// failures rather than swallowing them, matching the original block's
// behavior of logging and continuing where the original used try/catch at
// the call site.
//
// DUPLICATE LOGIC WARNING: src/lib/kairo.ts has its own client-side
// saveDealState() that does this same deal_state upsert for the New Deal
// upload and Review "Add Call" flows (it can't call this function directly
// -- this runs in Deno, that runs in the browser). Its `stateRow` MUST stay
// field-for-field identical to this one's. Adding a field here without
// mirroring it there previously caused `pillars` to silently go missing
// from Deal Review for every deal reviewed via manual upload. If you add a
// field to either file, add it to both in the same change. The same now
// applies to resolveDealStageServer / resolveDealStage in kairo.ts.
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
    pillars: review.deal.pillars ?? null,
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

  // Resolve deal_stage against the deal's current stage on record before
  // writing risk_level -- needs a fresh read since callers don't all pass
  // the deal row into this function.
  const { data: dealRow } = await supabase
    .from('deals')
    .select('deal_stage')
    .eq('id', dealId)
    .maybeSingle();

  const resolvedStage = dealRow?.deal_stage
    ? resolveDealStageServer(dealRow.deal_stage, review)
    : undefined;

  await supabase
    .from('deals')
    .update({
      ...(resolvedStage ? { deal_stage: resolvedStage } : {}),
      risk_level: getRiskLevel(review.deal.status),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId);
}