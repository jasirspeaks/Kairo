import { describe, it, expect } from 'vitest';
import {
  normalizeEvidenceItem,
  normalizeEvidenceList,
  normalizePillarKey,
  normalizeGroundingType,
} from '../src/deal/evidence';
import type { GroundedEvidenceItem } from '../src/types';

describe('Canonical Evidence Pipeline Test Suite', () => {
  describe('normalizePillarKey', () => {
    it('normalizes valid pillar keys with different casings and hyphens', () => {
      expect(normalizePillarKey('compelling_event')).toBe('compelling_event');
      expect(normalizePillarKey('COMPELLING_EVENT')).toBe('compelling_event');
      expect(normalizePillarKey('compelling-event')).toBe('compelling_event');
      expect(normalizePillarKey('economic_buyer')).toBe('economic_buyer');
      expect(normalizePillarKey('decision_process')).toBe('decision_process');
      expect(normalizePillarKey('budget')).toBe('budget');
      expect(normalizePillarKey('champion')).toBe('champion');
    });

    it('returns null for unknown or empty pillar keys', () => {
      expect(normalizePillarKey('')).toBeNull();
      expect(normalizePillarKey(null)).toBeNull();
      expect(normalizePillarKey('pricing_model')).toBeNull();
      expect(normalizePillarKey(123)).toBeNull();
    });
  });

  describe('normalizeGroundingType', () => {
    it('normalizes valid grounding types', () => {
      expect(normalizeGroundingType('explicit_statement')).toBe('explicit_statement');
      expect(normalizeGroundingType('EXPLICIT_STATEMENT')).toBe('explicit_statement');
      expect(normalizeGroundingType('behavioral-inference')).toBe('behavioral_inference');
      expect(normalizeGroundingType('structural_absence')).toBe('structural_absence');
    });

    it('falls back to explicit_statement for unknown grounding types', () => {
      expect(normalizeGroundingType('unknown_type')).toBe('explicit_statement');
      expect(normalizeGroundingType(null)).toBe('explicit_statement');
    });
  });

  describe('normalizeEvidenceItem', () => {
    it('normalizes legacy string quotes into structured GroundedEvidenceItem', () => {
      const raw = 'Buyer: "We need this done before Q4 budget freeze."';
      const item = normalizeEvidenceItem(raw);
      expect(item).not.toBeNull();
      expect(item?.quote).toBe('Buyer: "We need this done before Q4 budget freeze."');
      expect(item?.speaker).toBeNull();
      expect(item?.pillar_key).toBeNull();
      expect(item?.grounding_type).toBe('explicit_statement');
      expect(item?.confidence).toBe(80);
    });

    it('normalizes structured evidence objects cleanly', () => {
      const raw = {
        quote: 'We have $100k approved in our departmental budget.',
        speaker: 'John (VP Eng)',
        pillar_key: 'budget',
        grounding_type: 'explicit_statement',
        confidence: 95,
      };
      const item = normalizeEvidenceItem(raw);
      expect(item).toEqual({
        quote: 'We have $100k approved in our departmental budget.',
        speaker: 'John (VP Eng)',
        pillar_key: 'budget',
        grounding_type: 'explicit_statement',
        confidence: 95,
        ai_inference_id: null,
      });
    });

    it('handles hyphenated pillar keys and trims quotes', () => {
      const raw = {
        quote: '  "I am the decision maker along with the CFO."  ',
        speaker: '  Jane Doe  ',
        pillar_key: 'economic-buyer',
        grounding_type: 'behavioral-inference',
        confidence: 88,
      };
      const item = normalizeEvidenceItem(raw);
      expect(item).toEqual({
        quote: '"I am the decision maker along with the CFO."',
        speaker: 'Jane Doe',
        pillar_key: 'economic_buyer',
        grounding_type: 'behavioral_inference',
        confidence: 88,
        ai_inference_id: null,
      });
    });

    it('bounds confidence within 0-100 and handles invalid confidence values', () => {
      const highConf = normalizeEvidenceItem({ quote: 'Test quote', confidence: 150 });
      expect(highConf?.confidence).toBe(100);

      const negConf = normalizeEvidenceItem({ quote: 'Test quote', confidence: -20 });
      expect(negConf?.confidence).toBe(0);

      const nanConf = normalizeEvidenceItem({ quote: 'Test quote', confidence: NaN });
      expect(nanConf?.confidence).toBe(80);
    });

    it('rejects empty or whitespace-only quotes', () => {
      expect(normalizeEvidenceItem('')).toBeNull();
      expect(normalizeEvidenceItem('   ')).toBeNull();
      expect(normalizeEvidenceItem({ quote: '' })).toBeNull();
      expect(normalizeEvidenceItem({ quote: '   ' })).toBeNull();
      expect(normalizeEvidenceItem(null)).toBeNull();
    });
  });

  describe('normalizeEvidenceList', () => {
    it('normalizes a mixed list of string and object evidence items, filtering invalid ones', () => {
      const rawList = [
        'Quote 1: direct buyer statement',
        {
          quote: 'Quote 2: champion commitment',
          speaker: 'Alice',
          pillar_key: 'champion',
          grounding_type: 'explicit_statement',
          confidence: 90,
        },
        '',
        { quote: '   ' },
        {
          quote: 'Quote 3: timeline constraint',
          pillar_key: 'compelling_event',
        },
      ];

      const result = normalizeEvidenceList(rawList);
      expect(result.length).toBe(3);
      expect(result[0].quote).toBe('Quote 1: direct buyer statement');
      expect(result[1].speaker).toBe('Alice');
      expect(result[1].pillar_key).toBe('champion');
      expect(result[2].pillar_key).toBe('compelling_event');
    });

    it('returns empty array when input is not an array', () => {
      expect(normalizeEvidenceList(null)).toEqual([]);
      expect(normalizeEvidenceList(undefined)).toEqual([]);
      expect(normalizeEvidenceList('not an array')).toEqual([]);
    });
  });
});
