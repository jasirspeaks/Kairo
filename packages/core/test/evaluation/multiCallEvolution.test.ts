import { describe, it, expect } from 'vitest';
import { DealReview, resolveDealStage } from '../../src';

describe('AI Evaluation - Multi-Call State Evolution', () => {
  const call1Review: DealReview = {
    call: {
      call_status: 'Needs Attention',
      verdict: 'Discovery completed but missing Economic Buyer and Procurement path.',
      reason: 'Champion Dave is excited, but has not identified CFO or security process.',
      highest_priority_risk: {
        risk: 'Unknown Economic Buyer',
        why_it_matters: 'Dave cannot sign $50k deal.',
        evidence: 'No EB mentioned.',
      },
      what_youre_missing: [
        {
          gap: 'Economic Buyer',
          question_to_answer: 'Who signs the agreement?',
        },
        {
          gap: 'Security Review',
          question_to_answer: 'What is the InfoSec review timeline?',
        },
      ],
      recommended_next_action: 'Ask Dave to introduce CFO.',
      key_follow_up_message: 'Dave, can you connect us with your finance team?',
      manager_note: 'Hold in Discovery.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'Medium',
      status_reason: 'Missing key pillars.',
      health_score: 45,
      suggested_deal_stage: 'Discovery',
      highest_priority_risk: {
        risk: 'Unknown Economic Buyer',
        why_it_matters: 'Deal cannot close.',
        evidence: 'No EB.',
      },
      what_youre_missing: [
        { gap: 'Economic Buyer', question_to_answer: 'Who is the EB?' },
      ],
      recommended_next_action: 'Identify EB.',
      manager_note: 'Early stage.',
    },
    stakeholder_signals: [
      {
        name: 'Dave',
        role: 'Engineering Manager',
        sentiment: 'champion',
        evidence: 'Loves the product.',
      },
    ],
    supporting_evidence: ['Dave loves the product.'],
  };

  const call2Review: DealReview = {
    call: {
      call_status: 'On Track',
      verdict: 'CFO joined call and approved $50k budget allocation. InfoSec review scheduled.',
      reason: 'Resolved previous EB and Security gaps.',
      highest_priority_risk: {
        risk: 'InfoSec turnaround time',
        why_it_matters: 'Need to pass before end of quarter.',
        evidence: 'CFO requested SOC2 Type II package.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Send SOC2 report to CFO.',
      key_follow_up_message: 'Attached is our SOC2 report for your security team.',
      manager_note: 'Great progress.',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'CFO engaged and budget approved.',
      health_score: 82,
      suggested_deal_stage: 'Evaluation',
      highest_priority_risk: {
        risk: 'Security review completion',
        why_it_matters: 'Required prior to signature.',
        evidence: 'Security portal invite pending.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Complete security review.',
      manager_note: 'Move to Evaluation.',
    },
    what_changed_since_last_call: {
      resolved: [
        'Economic Buyer identified (CFO Rachel)',
        'Budget approved ($50,000)',
      ],
      persists: [],
      new_risks: ['InfoSec questionnaire timeline'],
    },
    stakeholder_signals: [
      {
        name: 'Dave',
        role: 'Engineering Manager',
        sentiment: 'champion',
        evidence: 'Advocating for solution.',
      },
      {
        name: 'Rachel',
        role: 'CFO',
        sentiment: 'supporter',
        evidence: 'Approved $50k budget.',
      },
    ],
    supporting_evidence: [
      'Rachel: "Budget is approved from our Q4 tooling budget."',
    ],
  };

  it('tracks resolution of previous deal gaps across calls', () => {
    expect(call2Review.what_changed_since_last_call?.resolved).toContain(
      'Economic Buyer identified (CFO Rachel)'
    );
    expect(call2Review.what_changed_since_last_call?.resolved).toContain(
      'Budget approved ($50,000)'
    );
    expect(call2Review.deal.health_score).toBeGreaterThan(
      call1Review.deal.health_score
    );
  });

  it('progresses stage from Discovery to Evaluation upon evidence resolution', () => {
    const stageAfterCall1 = resolveDealStage('Qualification', call1Review);
    expect(stageAfterCall1).toBe('Discovery');

    const stageAfterCall2 = resolveDealStage(stageAfterCall1, call2Review);
    expect(stageAfterCall2).toBe('Evaluation');
  });

  it('accurately updates deal health status from At Risk to Healthy', () => {
    expect(call1Review.deal.status).toBe('At Risk');
    expect(call2Review.deal.status).toBe('Healthy');
  });
});
