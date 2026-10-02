import {
  DealReview,
  DealStatus,
  PillarKey,
  PillarStatus,
} from '../types';

export interface DealConsistencyResult {
  valid: boolean;
  adjustments: string[];
  review: DealReview;
}

const PILLAR_CONFIDENCE_RANGES: Record<PillarStatus, [number, number]> = {
  confirmed: [70, 100],
  partial: [35, 69],
  unconfirmed: [0, 34],
  not_yet_relevant: [0, 0],
};

const PILLAR_KEYS: PillarKey[] = [
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
];

/**
 * Validates and enforces structural consistency across AI deal judgment.
 * Ensures health score, deal status, stage inference, and 5-pillar evaluations
 * are mutually consistent without overriding nuanced AI reasoning.
 */
export function validateDealStateConsistency(
  rawReview: DealReview
): DealConsistencyResult {
  const review = JSON.parse(JSON.stringify(rawReview)) as DealReview;
  const adjustments: string[] = [];

  const deal = review.deal;
  if (!deal) {
    return { valid: false, adjustments: ['Missing deal object'], review };
  }

  // 1. Terminal Deal Status and Stage Bounds
  if (deal.status === 'Won') {
    if (deal.health_score !== 100) {
      adjustments.push(`Won deal health_score adjusted from ${deal.health_score} to 100`);
      deal.health_score = 100;
    }
    if (deal.suggested_deal_stage && deal.suggested_deal_stage !== 'Closed Won') {
      adjustments.push(`Won deal stage adjusted to Closed Won`);
      deal.suggested_deal_stage = 'Closed Won';
    }
  } else if (deal.status === 'Lost') {
    if (deal.health_score !== 0) {
      adjustments.push(`Lost deal health_score adjusted from ${deal.health_score} to 0`);
      deal.health_score = 0;
    }
    if (deal.suggested_deal_stage && deal.suggested_deal_stage !== 'Closed Lost') {
      adjustments.push(`Lost deal stage adjusted to Closed Lost`);
      deal.suggested_deal_stage = 'Closed Lost';
    }
  } else {
    // 2. Non-terminal Status Health Score Bounding
    if (deal.status === 'Critical' && deal.health_score > 39) {
      adjustments.push(`Critical deal health_score clamped from ${deal.health_score} to 39`);
      deal.health_score = 39;
    } else if (deal.status === 'At Risk' && deal.health_score > 65) {
      adjustments.push(`At Risk deal health_score clamped from ${deal.health_score} to 65`);
      deal.health_score = 65;
    } else if (deal.status === 'Healthy' && deal.health_score < 60) {
      adjustments.push(`Healthy deal health_score clamped from ${deal.health_score} to 60`);
      deal.health_score = 60;
    }
  }

  // 3. Pillar Confidence & State Alignment
  if (deal.pillars) {
    let confirmedCount = 0;
    let relevantCount = 0;

    for (const key of PILLAR_KEYS) {
      const p = deal.pillars[key];
      if (p) {
        const [minConf, maxConf] = PILLAR_CONFIDENCE_RANGES[p.status] || [0, 100];
        if (p.confidence < minConf || p.confidence > maxConf) {
          const fallback =
            p.status === 'confirmed'
              ? 85
              : p.status === 'partial'
              ? 50
              : p.status === 'unconfirmed'
              ? 15
              : 0;
          adjustments.push(`Pillar ${key} (${p.status}) confidence ${p.confidence} out of range [${minConf}, ${maxConf}], adjusted to ${fallback}`);
          p.confidence = fallback;
        }

        if (p.status === 'confirmed') confirmedCount++;
        if (p.status !== 'not_yet_relevant') relevantCount++;
      }
    }

    // Zero confirmed pillars cannot have high health score unless it's early unassessed deal
    if (confirmedCount === 0 && relevantCount >= 2 && deal.status !== 'Won') {
      if (deal.health_score > 50) {
        adjustments.push(`Deal with 0 confirmed pillars health_score clamped from ${deal.health_score} to 50`);
        deal.health_score = 50;
      }
      if (deal.status === 'Healthy') {
        adjustments.push(`Deal with 0 confirmed pillars cannot be Healthy, adjusted to At Risk`);
        deal.status = 'At Risk';
      }
    }

    // 4+ confirmed pillars with high confidence should not be below moderate health unless Critical blocker
    if (confirmedCount >= 4 && deal.status !== 'Critical' && deal.status !== 'Lost') {
      if (deal.health_score < 65) {
        adjustments.push(`Deal with ${confirmedCount} confirmed pillars health_score raised from ${deal.health_score} to 65`);
        deal.health_score = 65;
      }
    }
  }

  return {
    valid: adjustments.length === 0,
    adjustments,
    review,
  };
}
