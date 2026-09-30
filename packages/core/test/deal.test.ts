import { describe, it, expect } from 'vitest';
import {
  resolveDealStage,
  getRiskLevel,
  getStatusColor,
  formatDealValue,
  getHealthScoreColor,
  getSentimentLabel,
  getSentimentColor,
  getPillarBarColor,
  buildActivityTimeline,
  type DealReview,
  type Conversation,
  type Stakeholder,
} from '../src';

describe('Domain Deal Logic - resolveDealStage', () => {
  const baseReview: DealReview = {
    call: {
      call_status: 'On Track',
      verdict: 'Good call',
      reason: 'Progressed',
      highest_priority_risk: { risk: 'None', why_it_matters: '', evidence: '' },
      what_youre_missing: [],
      recommended_next_action: 'Follow up',
      key_follow_up_message: 'Thanks',
      manager_note: '',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'Healthy',
      health_score: 85,
      highest_priority_risk: { risk: 'None', why_it_matters: '', evidence: '' },
      what_youre_missing: [],
      recommended_next_action: 'Next step',
      manager_note: '',
    },
    stakeholder_signals: [],
    supporting_evidence: [],
  };

  it('promotes to Closed Won when deal status is Won', () => {
    const review: DealReview = {
      ...baseReview,
      deal: { ...baseReview.deal, status: 'Won' },
    };
    const next = resolveDealStage('Negotiation', review);
    expect(next).toBe('Closed Won');
  });

  it('promotes to Closed Lost when deal status is Lost', () => {
    const review: DealReview = {
      ...baseReview,
      deal: { ...baseReview.deal, status: 'Lost' },
    };
    const next = resolveDealStage('Evaluation', review);
    expect(next).toBe('Closed Lost');
  });

  it('advances stage forward in DEAL_STAGES order', () => {
    const review: DealReview = {
      ...baseReview,
      deal: { ...baseReview.deal, suggested_deal_stage: 'Demo' },
    };
    const next = resolveDealStage('Discovery', review);
    expect(next).toBe('Demo');
  });

  it('holds current stage when suggested stage is earlier without override', () => {
    const review: DealReview = {
      ...baseReview,
      deal: { ...baseReview.deal, suggested_deal_stage: 'Discovery' },
    };
    const next = resolveDealStage('Proposal', review);
    expect(next).toBe('Proposal');
  });

  it('regresses stage backward when stage_regression_override is true', () => {
    const review: DealReview = {
      ...baseReview,
      deal: {
        ...baseReview.deal,
        suggested_deal_stage: 'Discovery',
        stage_regression_override: true,
      },
    };
    const next = resolveDealStage('Proposal', review);
    expect(next).toBe('Discovery');
  });

  it('leaves stage untouched when no suggested stage is provided', () => {
    const next = resolveDealStage('Evaluation', baseReview);
    expect(next).toBe('Evaluation');
  });
});

describe('Domain Deal Logic - Risk & Styling Rules', () => {
  it('correctly categorizes risk levels', () => {
    expect(getRiskLevel('Critical')).toBe('high');
    expect(getRiskLevel('At Risk')).toBe('high');
    expect(getRiskLevel('Stalled')).toBe('medium');
    expect(getRiskLevel('Recovering')).toBe('medium');
    expect(getRiskLevel('Healthy')).toBe('low');
    expect(getRiskLevel('Promising')).toBe('low');
    expect(getRiskLevel('Won')).toBe('low');
    expect(getRiskLevel('Lost')).toBe('none');
    expect(getRiskLevel('Unknown')).toBe('none');
  });

  it('returns valid status colors', () => {
    expect(getStatusColor('Healthy')).toBe('#3DD68C');
    expect(getStatusColor('Critical')).toBe('#FF667A');
    expect(getStatusColor('Unknown')).toBe('#8B93A7');
  });

  it('formats deal currency values properly', () => {
    expect(formatDealValue(null)).toBe('—');
    expect(formatDealValue(undefined)).toBe('—');
    expect(formatDealValue(50000)).toBe('$50,000');
    expect(formatDealValue(100000)).toBe('$100K');
    expect(formatDealValue(1000000)).toBe('$1M');
  });

  it('calculates health score color thresholds correctly', () => {
    expect(getHealthScoreColor(85)).toBe('#3DD68C'); // >= 70
    expect(getHealthScoreColor(50)).toBe('#F6B23E'); // 40 - 69
    expect(getHealthScoreColor(20)).toBe('#FF667A'); // < 40
  });

  it('resolves stakeholder sentiments correctly', () => {
    expect(getSentimentLabel('champion')).toBe('Champion');
    expect(getSentimentLabel(null)).toBe('Neutral');
    expect(getSentimentColor('champion')).toBe('#3DD68C');
    expect(getSentimentColor('blocker')).toBe('#FF667A');
    expect(getSentimentColor(undefined)).toBe('#8B93A7');
  });

  it('computes pillar bar colors', () => {
    expect(getPillarBarColor(80)).toBe('#3DD68C');
    expect(getPillarBarColor(50)).toBe('#F6B23E');
    expect(getPillarBarColor(20)).toBe('#FF667A');
  });
});

describe('Domain Deal Logic - Activity Timeline', () => {
  it('chronologically sorts calls and stakeholders', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Qualification',
        input_type: 'audio',
        transcript: 'Call 1',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-10T10:00:00Z',
      },
      {
        id: 'c2',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 2',
        deal_stage: 'Discovery',
        input_type: 'audio',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
    ];

    const stakeholders: Stakeholder[] = [
      {
        id: 's1',
        deal_id: 'd1',
        user_id: 'u1',
        name: 'Alice',
        role: 'VP',
        sentiment: 'champion',
        notes: 'Champion signal',
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, stakeholders);
    expect(timeline.length).toBe(3);
    expect(timeline[0].id).toBe('c2'); // Jan 20
    expect(timeline[1].id).toBe('s1'); // Jan 15
    expect(timeline[2].id).toBe('c1'); // Jan 10
  });
});
