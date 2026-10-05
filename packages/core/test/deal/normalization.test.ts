import { describe, it, expect } from 'vitest';
import {
  normalizeMissingInfo,
  normalizeExtraction,
  normalizeCall,
  normalizeDeal,
  normalizeRisk,
  normalizeStakeholders,
  normalizeSupportingEvidence,
} from '../../src';

describe('Missing Information & Review Normalization Suite', () => {
  const validBaseCall = {
    call_status: 'On Track',
    verdict: 'Evidenced progression on discovery.',
    reason: 'Prospect shared detailed infrastructure constraints and timeline.',
    highest_priority_risk: {
      risk: 'Economic Buyer not yet identified',
      why_it_matters: 'Single threaded technical discussion.',
      evidence: 'Only lead engineer attended.',
      category: 'economic_buyer',
    },
    what_youre_missing: [
      {
        gap: 'Budget authority and procurement timeline',
        question_to_answer: 'What is the approval threshold for this department?',
      },
    ],
    recommended_next_action: 'Ask champion for introduction to department VP.',
    key_follow_up_message: 'Thanks for walking through the architecture today.',
    manager_note: 'Progressing nicely. Need EB path.',
  };

  const validBaseDeal = {
    status: 'Promising',
    confidence: 'High',
    status_reason: 'Strong technical validation with clear timeline.',
    health_score: 75,
    highest_priority_risk: {
      risk: 'Economic Buyer not yet identified',
      why_it_matters: 'Single threaded technical discussion.',
      evidence: 'Only lead engineer attended.',
      category: 'economic_buyer',
    },
    what_youre_missing: [
      {
        gap: 'Budget authority and procurement timeline',
        question_to_answer: 'What is the approval threshold for this department?',
      },
    ],
    recommended_next_action: 'Secure EB meeting.',
    manager_note: 'Hold in Discovery until EB is identified.',
    suggested_deal_stage: 'Discovery',
    stage_regression_override: false,
    pillars: {
      compelling_event: { status: 'confirmed', confidence: 85, evidence: 'Hard migration deadline Nov 1.' },
      economic_buyer: { status: 'unconfirmed', confidence: 15, evidence: 'No economic buyer mentioned.' },
      decision_process: { status: 'partial', confidence: 50, evidence: 'Tech committee evaluates next.' },
      budget: { status: 'partial', confidence: 55, evidence: 'Allocated within innovation budget.' },
      champion: { status: 'confirmed', confidence: 80, evidence: 'Lead architect driving adoption.' },
    },
  };

  describe('Original Regression: call.what_youre_missing and deal.what_youre_missing normalization', () => {
    it('safely handles omitted / undefined what_youre_missing (e.g. model omitted optional schema field)', () => {
      const result = normalizeMissingInfo(undefined, 'call.what_youre_missing');
      expect(result).toEqual([]);
    });

    it('safely handles null what_youre_missing', () => {
      const result = normalizeMissingInfo(null, 'deal.what_youre_missing');
      expect(result).toEqual([]);
    });

    it('preserves valid array of MissingInfo objects', () => {
      const input = [
        { gap: 'Decision process unknown', question_to_answer: 'Who signs off?' },
        { gap: 'Budget unconfirmed', question_to_answer: 'Is budget approved?' },
      ];
      const result = normalizeMissingInfo(input, 'call.what_youre_missing');
      expect(result).toEqual(input);
      expect(result).toHaveLength(2);
    });

    it('caps array to maximum 3 items', () => {
      const input = [
        { gap: 'Gap 1', question_to_answer: 'Q1' },
        { gap: 'Gap 2', question_to_answer: 'Q2' },
        { gap: 'Gap 3', question_to_answer: 'Q3' },
        { gap: 'Gap 4', question_to_answer: 'Q4' },
      ];
      const result = normalizeMissingInfo(input, 'call.what_youre_missing');
      expect(result).toHaveLength(3);
      expect(result[0].gap).toBe('Gap 1');
      expect(result[2].gap).toBe('Gap 3');
    });

    it('safely wraps single valid missing-info object into a 1-element array', () => {
      const singleObject = {
        gap: 'Budget authority unconfirmed',
        question_to_answer: 'Who owns budget?',
      };
      const result = normalizeMissingInfo(singleObject, 'call.what_youre_missing');
      expect(result).toEqual([
        {
          gap: 'Budget authority unconfirmed',
          question_to_answer: 'Who owns budget?',
        },
      ]);
    });

    it('safely wraps single object with only gap into MissingInfo', () => {
      const singleObject = { gap: 'Procurement timeline' };
      const result = normalizeMissingInfo(singleObject, 'call.what_youre_missing');
      expect(result).toEqual([
        {
          gap: 'Procurement timeline',
          question_to_answer: '',
        },
      ]);
    });

    it('safely normalizes array of strings into MissingInfo array', () => {
      const stringArray = ['Competitor in evaluation', 'Legal review timeline'];
      const result = normalizeMissingInfo(stringArray, 'deal.what_youre_missing');
      expect(result).toEqual([
        { gap: 'Competitor in evaluation', question_to_answer: '' },
        { gap: 'Legal review timeline', question_to_answer: '' },
      ]);
    });

    it('safely normalizes single string gap into MissingInfo array', () => {
      const singleString = 'Need to confirm economic buyer';
      const result = normalizeMissingInfo(singleString, 'deal.what_youre_missing');
      expect(result).toEqual([
        { gap: 'Need to confirm economic buyer', question_to_answer: '' },
      ]);
    });

    it('normalizes "none", "N/A", "[]", "{}" strings and empty object to empty array', () => {
      expect(normalizeMissingInfo('none', 'test')).toEqual([]);
      expect(normalizeMissingInfo('None', 'test')).toEqual([]);
      expect(normalizeMissingInfo('N/A', 'test')).toEqual([]);
      expect(normalizeMissingInfo('n/a', 'test')).toEqual([]);
      expect(normalizeMissingInfo('[]', 'test')).toEqual([]);
      expect(normalizeMissingInfo('{}', 'test')).toEqual([]);
      expect(normalizeMissingInfo('', 'test')).toEqual([]);
      expect(normalizeMissingInfo({}, 'test')).toEqual([]);
    });

    it('rejects genuinely corrupt scalar types with descriptive error', () => {
      expect(() => normalizeMissingInfo(12345, 'call.what_youre_missing')).toThrow(
        'call.what_youre_missing has invalid type number. Expected an array of missing information.'
      );
      expect(() => normalizeMissingInfo(true, 'deal.what_youre_missing')).toThrow(
        'deal.what_youre_missing has invalid type boolean. Expected an array of missing information.'
      );
    });

    it('rejects unrecognized object structure without gap/question', () => {
      expect(() => normalizeMissingInfo({ foo: 'bar', score: 99 }, 'call.what_youre_missing')).toThrow(
        'call.what_youre_missing contains an unrecognized object structure.'
      );
    });

    it('rejects array containing invalid scalar items', () => {
      expect(() => normalizeMissingInfo([123, 456], 'call.what_youre_missing')).toThrow(
        'call.what_youre_missing item must be an object with gap and question_to_answer or a string.'
      );
    });
  });

  describe('Full Extraction Normalization (normalizeExtraction)', () => {
    it('normalizes a complete raw AI extraction successfully', () => {
      const raw = {
        call: validBaseCall,
        deal: validBaseDeal,
        stakeholder_signals: [
          { name: 'Alice', role: 'Architect', sentiment: 'champion', evidence: 'Requested trial' },
        ],
        supporting_evidence: [
          {
            quote: 'We need to migrate by November 1st.',
            speaker: 'Alice',
            pillar_key: 'compelling_event',
            grounding_type: 'explicit_statement',
            confidence: 90,
          },
        ],
      };

      const result = normalizeExtraction(raw, true);
      expect(result.call.what_youre_missing).toHaveLength(1);
      expect(result.deal.what_youre_missing).toHaveLength(1);
      expect(result.stakeholder_signals).toHaveLength(1);
      expect(result.supporting_evidence).toHaveLength(1);
      expect(result.what_changed_since_last_call).toBeUndefined();
    });

    it('handles raw model response where what_youre_missing is omitted in call and deal', () => {
      const rawWithoutMissing = {
        call: {
          ...validBaseCall,
          what_youre_missing: undefined,
        },
        deal: {
          ...validBaseDeal,
          what_youre_missing: undefined,
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      };

      const result = normalizeExtraction(rawWithoutMissing, true);
      expect(result.call.what_youre_missing).toEqual([]);
      expect(result.deal.what_youre_missing).toEqual([]);
      expect(result.call.verdict).toBe(validBaseCall.verdict);
      expect(result.deal.status).toBe('Promising');
    });

    it('handles subsequent calls and retains what_changed_since_last_call', () => {
      const rawSubsequent = {
        call: validBaseCall,
        deal: validBaseDeal,
        what_changed_since_last_call: {
          resolved: [{ risk: 'Old risk resolved', category: 'economic_buyer' }],
          persists: [],
          new_risks: [{ risk: 'New security requirement', category: 'decision_process' }],
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      };

      const result = normalizeExtraction(rawSubsequent, false);
      expect(result.what_changed_since_last_call).toBeDefined();
      expect(result.what_changed_since_last_call?.resolved).toHaveLength(1);
      expect(result.what_changed_since_last_call?.new_risks).toHaveLength(1);
    });

    it('rejects corrupt extraction root', () => {
      expect(() => normalizeExtraction(null as any, true)).toThrow(
        'Invalid extraction format returned by model.'
      );
      expect(() => normalizeExtraction('not an object' as any, true)).toThrow(
        'Invalid extraction format returned by model.'
      );
    });
  });
});
