import { DealStage, DealReview, DEAL_STAGES } from '../types';

/**
 * Deal Stage is set entirely from what call-review concretely observed happened in
 * the deal's calls (deal.suggested_deal_stage).
 *
 * Rules:
 * 1. An explicit Won/Lost call always promotes to the matching Closed stage.
 * 2. A rare explicit stage_regression_override lets the AI move the deal backward.
 * 3. Otherwise, the deal can only advance or hold: suggested_deal_stage is applied
 *    only if it sits at or after current stage in DEAL_STAGES order.
 * 4. If suggested_deal_stage is absent, current stage stands untouched.
 */
export function resolveDealStage(currentStage: DealStage, review: DealReview): DealStage {
  if (review.deal.status === 'Won') return 'Closed Won';
  if (review.deal.status === 'Lost') return 'Closed Lost';

  const suggested = review.deal.suggested_deal_stage;
  if (!suggested) return currentStage;

  if (review.deal.stage_regression_override) {
    return suggested;
  }

  const currentIndex = DEAL_STAGES.indexOf(currentStage as (typeof DEAL_STAGES)[number]);
  const suggestedIndex = DEAL_STAGES.indexOf(suggested);

  if (currentIndex === -1 || suggestedIndex === -1) return currentStage;

  return suggestedIndex >= currentIndex ? suggested : currentStage;
}
