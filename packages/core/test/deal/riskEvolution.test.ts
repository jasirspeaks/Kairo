import { describe, it, expect } from 'vitest';
import {
  normalizeRiskDeltaItem,
  normalizeRiskDeltaList,
  buildEvolution,
  NormalizedRiskDelta,
  Conversation,
} from '../../src';

describe('Risk Evolution Normalization & Pipeline', () => {
  describe('normalizeRiskDeltaItem', () => {
    it('normalizes string risk items', () => {
      expect(normalizeRiskDeltaItem('Budget approved')).toEqual({
        risk: 'Budget approved',
      });
      expect(normalizeRiskDeltaItem('  Security review cleared  ')).toEqual({
        risk: 'Security review cleared',
      });
    });

    it('normalizes structured RiskDeltaItem objects', () => {
      expect(
        normalizeRiskDeltaItem({
          risk: 'Economic buyer still unengaged',
          category: 'economic_buyer',
          why_it_matters: 'No CFO commitment yet',
        })
      ).toEqual({
        risk: 'Economic buyer still unengaged',
        category: 'economic_buyer',
        why_it_matters: 'No CFO commitment yet',
      });
    });

    it('supports objects with title property as fallback', () => {
      expect(
        normalizeRiskDeltaItem({
          title: 'Competitor offering 40% discount',
          category: 'competitor_threat',
          why_it_matters: 'Pricing pressure',
        })
      ).toEqual({
        risk: 'Competitor offering 40% discount',
        category: 'competitor_threat',
        why_it_matters: 'Pricing pressure',
      });
    });

    it('safely handles null, undefined, and non-object malformed values', () => {
      expect(normalizeRiskDeltaItem(null)).toBeNull();
      expect(normalizeRiskDeltaItem(undefined)).toBeNull();
      expect(normalizeRiskDeltaItem('')).toBeNull();
      expect(normalizeRiskDeltaItem('   ')).toBeNull();
      expect(normalizeRiskDeltaItem(123)).toBeNull();
      expect(normalizeRiskDeltaItem({})).toBeNull();
      expect(normalizeRiskDeltaItem({ risk: '' })).toBeNull();
      expect(normalizeRiskDeltaItem({ risk: '   ' })).toBeNull();
    });
  });

  describe('normalizeRiskDeltaList', () => {
    it('normalizes mixed arrays of strings and objects', () => {
      const mixed = [
        'Budget approved',
        {
          risk: 'Economic buyer unengaged',
          category: 'economic_buyer',
          why_it_matters: 'No CFO',
        },
        null,
        '',
        { title: 'Security review pending' },
      ];

      const result = normalizeRiskDeltaList(mixed);
      expect(result).toEqual([
        { risk: 'Budget approved' },
        {
          risk: 'Economic buyer unengaged',
          category: 'economic_buyer',
          why_it_matters: 'No CFO',
        },
        { risk: 'Security review pending' },
      ]);
    });

    it('handles non-array or empty inputs safely', () => {
      expect(normalizeRiskDeltaList(null)).toEqual([]);
      expect(normalizeRiskDeltaList(undefined)).toEqual([]);
      expect(normalizeRiskDeltaList('not-an-array')).toEqual([]);
      expect(normalizeRiskDeltaList([])).toEqual([]);
    });
  });

  describe('buildEvolution', () => {
    const call1: Conversation = {
      id: 'call-1',
      user_id: 'user-1',
      deal_id: 'deal-1',
      title: 'Discovery Call',
      deal_stage: 'Discovery',
      input_type: 'transcript',
      transcript: '...',
      audio_url: null,
      overall_score: null,
      sub_scores: null,
      status: 'complete',
      created_at: '2026-10-01T10:00:00Z',
      analysis_json: {
        call: {
          call_status: 'Needs Attention',
          verdict: 'Discovery call held',
          reason: 'Missing EB',
          highest_priority_risk: {
            risk: 'Economic Buyer unknown',
            why_it_matters: 'Cannot close without EB',
            evidence: 'No mention of CFO',
            category: 'economic_buyer',
          },
          what_youre_missing: [
            { gap: 'Procurement timeline', question_to_answer: 'When does procurement start?' },
          ],
          recommended_next_action: 'Identify EB',
          key_follow_up_message: 'Who is the CFO?',
          manager_note: 'Early stage',
        },
        deal: {
          status: 'At Risk',
          confidence: 'Medium',
          status_reason: 'Missing EB',
          health_score: 40,
          suggested_deal_stage: 'Discovery',
          highest_priority_risk: {
            risk: 'Economic Buyer unknown',
            why_it_matters: 'Cannot close without EB',
            evidence: 'No mention of CFO',
            category: 'economic_buyer',
          },
          what_youre_missing: [
            { gap: 'Procurement timeline', question_to_answer: 'When does procurement start?' },
          ],
          recommended_next_action: 'Identify EB',
          manager_note: 'Early stage',
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      },
    };

    const call2: Conversation = {
      id: 'call-2',
      user_id: 'user-1',
      deal_id: 'deal-1',
      title: 'Demo Call',
      deal_stage: 'Demo',
      input_type: 'transcript',
      transcript: '...',
      audio_url: null,
      overall_score: null,
      sub_scores: null,
      status: 'complete',
      created_at: '2026-10-02T10:00:00Z',
      analysis_json: {
        call: {
          call_status: 'On Track',
          verdict: 'CFO joined and approved budget',
          reason: 'EB resolved',
          highest_priority_risk: {
            risk: 'Security review pending',
            why_it_matters: 'Required for closing',
            evidence: 'SOC2 required',
            category: 'decision_process',
          },
          what_youre_missing: [],
          recommended_next_action: 'Send SOC2',
          key_follow_up_message: 'Here is SOC2',
          manager_note: 'Great progress',
        },
        deal: {
          status: 'Healthy',
          confidence: 'High',
          status_reason: 'EB confirmed',
          health_score: 80,
          suggested_deal_stage: 'Evaluation',
          highest_priority_risk: {
            risk: 'Security review pending',
            why_it_matters: 'Required for closing',
            evidence: 'SOC2 required',
            category: 'decision_process',
          },
          what_youre_missing: [],
          recommended_next_action: 'Send SOC2',
          manager_note: 'Great progress',
        },
        what_changed_since_last_call: {
          resolved: [
            {
              risk: 'Economic Buyer unknown',
              category: 'economic_buyer',
              why_it_matters: 'CFO Rachel engaged',
            },
          ],
          persists: [],
          new_risks: [
            {
              risk: 'Security review pending',
              category: 'decision_process',
              why_it_matters: 'Must clear before signature',
            },
          ],
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      },
    };

    const call3: Conversation = {
      id: 'call-3',
      user_id: 'user-1',
      deal_id: 'deal-1',
      title: 'Procurement Alignment',
      deal_stage: 'Negotiation',
      input_type: 'transcript',
      transcript: '...',
      audio_url: null,
      overall_score: null,
      sub_scores: null,
      status: 'complete',
      created_at: '2026-10-03T10:00:00Z',
      analysis_json: {
        call: {
          call_status: 'At Risk',
          verdict: 'Competitor discount bundle surfaced',
          reason: 'Price war',
          highest_priority_risk: {
            risk: 'Competitor Microsoft discount',
            why_it_matters: 'Aggressive pricing',
            evidence: 'Buyer received quote',
            category: 'competitor_threat',
          },
          what_youre_missing: [],
          recommended_next_action: 'Defend ROI',
          key_follow_up_message: 'Let us discuss ROI',
          manager_note: 'Defend deal',
        },
        deal: {
          status: 'At Risk',
          confidence: 'High',
          status_reason: 'Competitor threat',
          health_score: 60,
          suggested_deal_stage: 'Negotiation',
          highest_priority_risk: {
            risk: 'Competitor Microsoft discount',
            why_it_matters: 'Aggressive pricing',
            evidence: 'Buyer received quote',
            category: 'competitor_threat',
          },
          what_youre_missing: [],
          recommended_next_action: 'Defend ROI',
          manager_note: 'Defend deal',
        },
        what_changed_since_last_call: {
          // Testing legacy string entries + structured objects in the same call
          resolved: ['Security review pending'],
          persists: [],
          new_risks: [
            {
              risk: 'Competitor Microsoft discount',
              category: 'competitor_threat',
              why_it_matters: '40% discount bundle offered',
            },
          ],
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      },
    };

    it('correctly handles single-call deal with first-call fallback', () => {
      const evolution = buildEvolution([call1]);
      expect(evolution.length).toBe(1);
      expect(evolution[0].isFirstRead).toBe(true);
      expect(evolution[0].resolved).toEqual([]);
      expect(evolution[0].newRisks).toEqual([]);
      expect(evolution[0].persists).toEqual([
        {
          risk: 'Economic Buyer unknown',
          why_it_matters: 'Cannot close without EB',
          category: 'economic_buyer',
        },
        { risk: 'Procurement timeline' },
      ]);
    });

    it('correctly builds evolution timeline across multiple calls with structured RiskDeltaItem objects and legacy strings', () => {
      const evolution = buildEvolution([call1, call2, call3]);

      // Returns in newest-first order: call3, call2, call1
      expect(evolution.length).toBe(3);

      // Call 3 (newest)
      expect(evolution[0].call.id).toBe('call-3');
      expect(evolution[0].isFirstRead).toBe(false);
      expect(evolution[0].resolved).toEqual([{ risk: 'Security review pending' }]);
      expect(evolution[0].newRisks).toEqual([
        {
          risk: 'Competitor Microsoft discount',
          category: 'competitor_threat',
          why_it_matters: '40% discount bundle offered',
        },
      ]);

      // Call 2
      expect(evolution[1].call.id).toBe('call-2');
      expect(evolution[1].isFirstRead).toBe(false);
      expect(evolution[1].resolved).toEqual([
        {
          risk: 'Economic Buyer unknown',
          category: 'economic_buyer',
          why_it_matters: 'CFO Rachel engaged',
        },
      ]);
      expect(evolution[1].newRisks).toEqual([
        {
          risk: 'Security review pending',
          category: 'decision_process',
          why_it_matters: 'Must clear before signature',
        },
      ]);

      // Call 1 (first read)
      expect(evolution[2].call.id).toBe('call-1');
      expect(evolution[2].isFirstRead).toBe(true);
    });

    it('handles missing/null/empty what_changed_since_last_call without throwing', () => {
      const callWithEmptyDelta: Conversation = {
        ...call2,
        analysis_json: {
          ...call2.analysis_json!,
          what_changed_since_last_call: {
            resolved: [],
            persists: [],
            new_risks: [],
          },
        },
      };

      const evolution = buildEvolution([call1, callWithEmptyDelta]);
      // callWithEmptyDelta has no content and is not index 0, so it is skipped
      expect(evolution.length).toBe(1);
      expect(evolution[0].call.id).toBe('call-1');
    });

    it('handles malformed entries with null/undefined values in arrays', () => {
      const callWithMalformed: Conversation = {
        ...call2,
        analysis_json: {
          ...call2.analysis_json!,
          what_changed_since_last_call: {
            resolved: [null as any, { risk: 'Budget cleared' }, undefined as any, ''],
            persists: [{} as any, { risk: 'CFO pending', why_it_matters: 'Urgent' }],
            new_risks: [123 as any, { title: 'Legal hold' }],
          },
        },
      };

      const evolution = buildEvolution([call1, callWithMalformed]);
      expect(evolution.length).toBe(2);
      expect(evolution[0].resolved).toEqual([{ risk: 'Budget cleared' }]);
      expect(evolution[0].persists).toEqual([
        { risk: 'CFO pending', why_it_matters: 'Urgent', category: undefined },
      ]);
      expect(evolution[0].newRisks).toEqual([{ risk: 'Legal hold' }]);
    });
  });
});
