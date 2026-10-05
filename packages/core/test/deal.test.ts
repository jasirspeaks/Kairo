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
    // Jan 20: stage_transition (c2) + call (c2); Jan 15: stakeholder (s1); Jan 10: call (c1)
    expect(timeline.length).toBe(4);
    expect(timeline[0].kind).toBe('stage_transition');
    expect(timeline[1].id).toBe('c2');
    expect(timeline[2].id).toBe('s1');
    expect(timeline[3].id).toBe('c1');
  });

  // 1. One-call deal: No stage-change event
  it('scenario 1: one-call deal never displays a stage-change event', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Discovery',
        input_type: 'transcript',
        transcript: 'Call 1',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-10T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    expect(timeline.length).toBe(1);
    expect(timeline[0].kind).toBe('call');
    expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
  });

  // 2. Two-call deal with no stage change
  it('scenario 2: two-call deal with same stage displays no stage-change event', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Discovery',
        input_type: 'transcript',
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
        input_type: 'transcript',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    expect(timeline.length).toBe(2);
    expect(timeline.filter((item) => item.kind === 'call').length).toBe(2);
    expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
  });

  // 3. Two-call deal with stage change
  it('scenario 3: two-call deal with stage change displays exactly one stage-change event', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Qualification',
        input_type: 'transcript',
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
        input_type: 'transcript',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    const stageEvents = timeline.filter((item) => item.kind === 'stage_transition');
    expect(stageEvents.length).toBe(1);
    if (stageEvents[0].kind === 'stage_transition') {
      expect(stageEvents[0].transition.from_stage).toBe('Qualification');
      expect(stageEvents[0].transition.to_stage).toBe('Discovery');
    }
  });

  // 4. Three-call deal with stage change on call 3
  it('scenario 4: three-call deal with stage change on call 3 displays one stage-change event', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Discovery',
        input_type: 'transcript',
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
        input_type: 'transcript',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
      {
        id: 'c3',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 3',
        deal_stage: 'Evaluation',
        input_type: 'transcript',
        transcript: 'Call 3',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-30T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    const stageEvents = timeline.filter((item) => item.kind === 'stage_transition');
    expect(stageEvents.length).toBe(1);
    if (stageEvents[0].kind === 'stage_transition') {
      expect(stageEvents[0].transition.from_stage).toBe('Discovery');
      expect(stageEvents[0].transition.to_stage).toBe('Evaluation');
      expect(stageEvents[0].transition.conversation_id).toBe('c3');
    }
  });

  // 5. Multiple consecutive stage changes
  it('scenario 5: multiple consecutive stage changes generate transitions for each change', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Qualification',
        input_type: 'transcript',
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
        input_type: 'transcript',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
      {
        id: 'c3',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 3',
        deal_stage: 'Evaluation',
        input_type: 'transcript',
        transcript: 'Call 3',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-30T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    const stageEvents = timeline.filter((item) => item.kind === 'stage_transition');
    expect(stageEvents.length).toBe(2);

    // Newest first
    if (stageEvents[0].kind === 'stage_transition' && stageEvents[1].kind === 'stage_transition') {
      expect(stageEvents[0].transition.from_stage).toBe('Discovery');
      expect(stageEvents[0].transition.to_stage).toBe('Evaluation');

      expect(stageEvents[1].transition.from_stage).toBe('Qualification');
      expect(stageEvents[1].transition.to_stage).toBe('Discovery');
    }
  });

  // 6. Initial deal stage differing from first reviewed call
  it('scenario 6: first call stage differing from placeholder deal stage creates NO stage transition', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Evaluation', // e.g. deal creation was Qualification, but first call jump-starts Evaluation
        input_type: 'transcript',
        transcript: 'Call 1',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-10T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    expect(timeline.length).toBe(1);
    expect(timeline[0].kind).toBe('call');
    expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
  });

  // 7. Missing previous stage
  it('scenario 7: unanalyzed/missing stage calls do not create invalid transitions', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: null,
        input_type: 'transcript',
        transcript: 'Call 1',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'pending',
        created_at: '2026-01-10T10:00:00Z',
      },
      {
        id: 'c2',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 2',
        deal_stage: 'Discovery',
        input_type: 'transcript',
        transcript: 'Call 2',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-20T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, []);
    // Call 2 is the first call establishing a valid stage -> NO stage transition
    expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
    expect(timeline.filter((item) => item.kind === 'call').length).toBe(2);
  });

  // 8. Existing historical deals with legacy transition records
  it('scenario 8: historical deals with legacy first-call transition rows are sanitized', () => {
    const calls: Conversation[] = [
      {
        id: 'c1',
        user_id: 'u1',
        deal_id: 'd1',
        title: 'Call 1',
        deal_stage: 'Discovery',
        input_type: 'transcript',
        transcript: 'Call 1',
        audio_url: null,
        analysis_json: null,
        overall_score: null,
        sub_scores: null,
        status: 'complete',
        created_at: '2026-01-10T10:00:00Z',
      },
    ];

    // Database has legacy row created by old persist_deal_review on call 1
    const legacyTransitions = [
      {
        id: 'legacy-t1',
        deal_id: 'd1',
        conversation_id: 'c1',
        from_stage: 'Qualification' as const,
        to_stage: 'Discovery' as const,
        from_status: null,
        to_status: 'Healthy' as const,
        health_score_delta: 0,
        transition_reason: 'Legacy reason',
        created_at: '2026-01-10T10:00:00Z',
      },
    ];

    const timeline = buildActivityTimeline(calls, [], legacyTransitions);
    // Legacy first-call transition MUST be excluded
    expect(timeline.length).toBe(1);
    expect(timeline[0].kind).toBe('call');
    expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
  });

  // Regression tests explicitly specified by user
  describe('Regression Requirements', () => {
    it('first call Qualification -> Discovery produces NO stage-update event', () => {
      const calls: Conversation[] = [
        {
          id: 'c1',
          user_id: 'u1',
          deal_id: 'd1',
          title: 'Call 1',
          deal_stage: 'Discovery',
          input_type: 'transcript',
          transcript: 'Call 1',
          audio_url: null,
          analysis_json: null,
          overall_score: null,
          sub_scores: null,
          status: 'complete',
          created_at: '2026-01-10T10:00:00Z',
        },
      ];

      const transitions = [
        {
          id: 't1',
          deal_id: 'd1',
          conversation_id: 'c1',
          from_stage: 'Qualification' as const,
          to_stage: 'Discovery' as const,
          from_status: null,
          to_status: 'Healthy' as const,
          health_score_delta: 0,
          transition_reason: 'Initial qualification',
          created_at: '2026-01-10T10:00:00Z',
        },
      ];

      const timeline = buildActivityTimeline(calls, [], transitions);
      expect(timeline.some((item) => item.kind === 'stage_transition')).toBe(false);
      expect(timeline.length).toBe(1);
      expect(timeline[0].kind).toBe('call');
    });

    it('call 1 Qualification, call 2 Discovery produces ONE stage-update event Qualification -> Discovery', () => {
      const calls: Conversation[] = [
        {
          id: 'c1',
          user_id: 'u1',
          deal_id: 'd1',
          title: 'Call 1',
          deal_stage: 'Qualification',
          input_type: 'transcript',
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
          input_type: 'transcript',
          transcript: 'Call 2',
          audio_url: null,
          analysis_json: null,
          overall_score: null,
          sub_scores: null,
          status: 'complete',
          created_at: '2026-01-20T10:00:00Z',
        },
      ];

      const timeline = buildActivityTimeline(calls, []);
      const stageEvents = timeline.filter((item) => item.kind === 'stage_transition');
      expect(stageEvents.length).toBe(1);
      if (stageEvents[0].kind === 'stage_transition') {
        expect(stageEvents[0].transition.from_stage).toBe('Qualification');
        expect(stageEvents[0].transition.to_stage).toBe('Discovery');
      }
    });
  });
});

