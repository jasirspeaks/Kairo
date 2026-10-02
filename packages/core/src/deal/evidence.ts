import { GroundedEvidenceItem, GroundingType, PillarKey } from '../types';

const VALID_PILLAR_KEYS = new Set<PillarKey>([
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
]);

const VALID_GROUNDING_TYPES = new Set<GroundingType>([
  'explicit_statement',
  'behavioral_inference',
  'structural_absence',
]);

/**
 * Normalizes any evidence input (string or object) into a canonical GroundedEvidenceItem.
 */
export function normalizeEvidenceItem(raw: unknown): GroundedEvidenceItem | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return {
      quote: text,
      speaker: null,
      pillar_key: null,
      grounding_type: 'explicit_statement',
      confidence: 80,
    };
  }

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const quote = typeof obj.quote === 'string' ? obj.quote.trim() : '';
    if (!quote) return null;

    const speaker = typeof obj.speaker === 'string' && obj.speaker.trim() ? obj.speaker.trim() : null;
    const pillar_key =
      typeof obj.pillar_key === 'string' && VALID_PILLAR_KEYS.has(obj.pillar_key as PillarKey)
        ? (obj.pillar_key as PillarKey)
        : null;
    const grounding_type =
      typeof obj.grounding_type === 'string' && VALID_GROUNDING_TYPES.has(obj.grounding_type as GroundingType)
        ? (obj.grounding_type as GroundingType)
        : 'explicit_statement';
    const confidence =
      typeof obj.confidence === 'number' && !Number.isNaN(obj.confidence)
        ? Math.max(0, Math.min(100, Math.round(obj.confidence)))
        : 80;
    const ai_inference_id =
      typeof obj.ai_inference_id === 'string' && obj.ai_inference_id.trim()
        ? obj.ai_inference_id.trim()
        : null;

    return {
      quote,
      speaker,
      pillar_key,
      grounding_type,
      confidence,
      ai_inference_id,
    };
  }

  return null;
}

/**
 * Normalizes an array of raw evidence inputs into canonical GroundedEvidenceItem[].
 */
export function normalizeEvidenceList(raw: unknown): GroundedEvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const normalized: GroundedEvidenceItem[] = [];
  for (const item of raw) {
    const parsed = normalizeEvidenceItem(item);
    if (parsed) normalized.push(parsed);
  }
  return normalized;
}
