import { describe, it, expect } from 'vitest';
import { validateDealStateConsistency, DealReview } from '../../src';

describe('Server-Side Deal State Consistency Invariants', () => {
  const baseReview: DealReview = {
    call: {
      call_status: 'On Track',
      verdict: 'Standard discovery call.',
      reason: 'Discussed initial needs.',
      highest_priority_risk: {
        risk: 'Economic Buyer unknown',
        why_it_matters: 'Single threaded deal.',
        evidence: 'No EB present.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Engage EB.',
      key_follow_up_message: '',
      manager_note: 'Progressing.',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'Good engagement.',
      health_score: 85,
      highest_priority_risk: {
        risk: 'Economic Buyer unknown',
        why_it_matters: 'Single threaded deal.',
        evidence: 'No EB present.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Engage EB.',
      manager_note: 'Hold in discovery.',
      suggested_deal_stage: 'Discovery',
      pillars: {
        compelling_event: { status: 'confirmed', confidence: 85, evidence: 'Hard deadline Q4.' },
        economic_buyer: { status: 'confirmed', confidence: 90, evidence: 'VP Finance confirmed.' },
        decision_process: { status: 'confirmed', confidence: 80, evidence: '3 step evaluation.' },
        budget: { status: 'confirmed', confidence: 85, evidence: '$100k approved.' },
        champion: { status: 'partial', confidence: 50, evidence: 'Dir Eng advocating.' },
      },
    },
    stakeholder_signals: [],
    supporting_evidence: [],
  };

  it('preserves valid and balanced deal review', () => {
    const result = validateDealStateConsistency(baseReview);
    expect(result.valid).toBe(true);
    expect(result.adjustments).toEqual([]);
    expect(result.review.deal.health_score).toBe(85);
  });

  it('clamps Critical deal status health score to maximum 39', () => {
    const criticalReview: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        status: 'Critical',
        health_score: 80, // Inconsistent with Critical
      },
    };

    const result = validateDealStateConsistency(criticalReview);
    expect(result.valid).toBe(false);
    expect(result.review.deal.health_score).toBe(39);
    expect(result.adjustments.some((a) => a.includes('Critical deal health_score clamped'))).toBe(true);
  });

  it('clamps At Risk deal status health score to maximum 65', () => {
    const atRiskReview: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        status: 'At Risk',
        health_score: 90, // Inconsistent with At Risk
      },
    };

    const result = validateDealStateConsistency(atRiskReview);
    expect(result.valid).toBe(false);
    expect(result.review.deal.health_score).toBe(65);
  });

  it('forces Closed Won deal status to health score 100 and Closed Won stage', () => {
    const wonReview: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        status: 'Won',
        health_score: 40,
        suggested_deal_stage: 'Decision',
      },
    };

    const result = validateDealStateConsistency(wonReview);
    expect(result.review.deal.health_score).toBe(100);
    expect(result.review.deal.suggested_deal_stage).toBe('Closed Won');
  });

  it('forces Closed Lost deal status to health score 0 and Closed Lost stage', () => {
    const lostReview: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        status: 'Lost',
        health_score: 60,
        suggested_deal_stage: 'Negotiation',
      },
    };

    const result = validateDealStateConsistency(lostReview);
    expect(result.review.deal.health_score).toBe(0);
    expect(result.review.deal.suggested_deal_stage).toBe('Closed Lost');
  });

  it('demotes Healthy status and caps score at 50 if 0 pillars are confirmed', () => {
    const unconfirmedPillarsReview: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        status: 'Healthy',
        health_score: 85,
        pillars: {
          compelling_event: { status: 'unconfirmed', confidence: 15, evidence: '' },
          economic_buyer: { status: 'unconfirmed', confidence: 15, evidence: '' },
          decision_process: { status: 'unconfirmed', confidence: 15, evidence: '' },
          budget: { status: 'unconfirmed', confidence: 15, evidence: '' },
          champion: { status: 'unconfirmed', confidence: 15, evidence: '' },
        },
      },
    };

    const result = validateDealStateConsistency(unconfirmedPillarsReview);
    expect(result.valid).toBe(false);
    expect(result.review.deal.status).toBe('At Risk');
    expect(result.review.deal.health_score).toBe(50);
  });
});
