import {
  DealReview,
  MissingInfo,
  HighestPriorityRisk,
  PillarKey,
  PillarStatus,
  DealPillars,
  StakeholderSignal,
  GroundedEvidenceItem,
  DealStage,
  DEAL_STAGES,
  CallStatus,
  DealStatus,
  DealConfidence,
} from '../types';
import { validateDealStateConsistency } from './consistency';

export const VALID_DEAL_STATUSES = new Set([
  'Unknown', 'Healthy', 'Promising', 'At Risk', 'Critical', 'Stalled', 'Recovering', 'Won', 'Lost',
]);
export const VALID_CALL_STATUSES = new Set(['On Track', 'Needs Attention', 'At Risk', 'Stalled']);
export const VALID_CONFIDENCE = new Set(['High', 'Medium', 'Low']);
export const VALID_SENTIMENTS = new Set(['champion', 'supporter', 'neutral', 'skeptic', 'blocker']);
export const VALID_PILLAR_STATUSES = new Set(['confirmed', 'partial', 'unconfirmed', 'not_yet_relevant']);
export const PILLAR_KEYS: PillarKey[] = [
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
];
export const VALID_DEAL_STAGES = new Set<string>(DEAL_STAGES);

export const VALID_RISK_CATEGORIES = new Set([
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
  'competitor_threat',
  'procurement_delay',
  'general_risk',
]);

export const VALID_GROUNDING_TYPES = new Set(['explicit_statement', 'behavioral_inference', 'structural_absence']);

const PILLAR_CONFIDENCE_FALLBACK: Record<string, number> = {
  confirmed: 85,
  partial: 50,
  unconfirmed: 15,
  not_yet_relevant: 0,
};

const PILLAR_CONFIDENCE_RANGE: Record<string, [number, number]> = {
  confirmed: [70, 100],
  partial: [35, 69],
  unconfirmed: [0, 34],
  not_yet_relevant: [0, 0],
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeMissingInfo(raw: unknown, label = 'what_youre_missing'): MissingInfo[] {
  // If undefined or null, it represents an empty list (model omitted optional field or found no missing info)
  if (raw === undefined || raw === null) {
    return [];
  }

  // If a single string was returned
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || /^(none|n\/?a|nil|nothing|\[\]|\{\})$/i.test(trimmed)) {
      return [];
    }
    return [{ gap: trimmed, question_to_answer: '' }];
  }

  // If a single object was returned instead of an array
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const gap = typeof obj.gap === 'string' ? obj.gap.trim() : '';
    const question = typeof obj.question_to_answer === 'string'
      ? obj.question_to_answer.trim()
      : typeof obj.question === 'string'
      ? (obj.question as string).trim()
      : '';

    if (gap || question) {
      return [{ gap: gap || question, question_to_answer: question }];
    }
    if (Object.keys(obj).length === 0) {
      return [];
    }
    throw new Error(`${label} contains an unrecognized object structure.`);
  }

  // If an array was returned
  if (Array.isArray(raw)) {
    const result: MissingInfo[] = [];
    for (const item of raw.slice(0, 3)) {
      if (!item) continue;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed && !/^(none|n\/?a|nil|nothing)$/i.test(trimmed)) {
          result.push({ gap: trimmed, question_to_answer: '' });
        }
      } else if (typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const gap = typeof obj.gap === 'string' ? obj.gap.trim() : '';
        const question = typeof obj.question_to_answer === 'string'
          ? obj.question_to_answer.trim()
          : typeof obj.question === 'string'
          ? (obj.question as string).trim()
          : '';

        if (gap || question) {
          result.push({ gap: gap || question, question_to_answer: question });
        }
      } else {
        throw new Error(`${label} item must be an object with gap and question_to_answer or a string.`);
      }
    }
    return result;
  }

  throw new Error(`${label} has invalid type ${typeof raw}. Expected an array of missing information.`);
}

export function normalizeRisk(risk: unknown, label: string): HighestPriorityRisk {
  const r = risk as Record<string, unknown> | undefined;
  if (!r || typeof r.risk !== 'string' || !r.risk.trim()) {
    throw new Error(`Missing ${label}.risk.`);
  }
  const category = typeof r.category === 'string' && VALID_RISK_CATEGORIES.has(r.category)
    ? r.category
    : 'general_risk';
  return {
    risk: r.risk,
    why_it_matters: typeof r.why_it_matters === 'string' ? r.why_it_matters : '',
    evidence: typeof r.evidence === 'string' ? r.evidence : '',
    category,
  };
}

export function normalizeSupportingEvidence(raw: unknown): GroundedEvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.slice(0, 8);
  const result: GroundedEvidenceItem[] = [];

  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      result.push({
        quote: item.trim(),
        grounding_type: 'explicit_statement',
        confidence: 80,
        pillar_key: null,
        speaker: null,
      });
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const quote = typeof obj.quote === 'string' ? obj.quote.trim() : '';
      if (!quote) continue;

      const speaker = typeof obj.speaker === 'string' && obj.speaker.trim() ? obj.speaker.trim() : null;
      const rawPillar = typeof obj.pillar_key === 'string' ? obj.pillar_key.trim().toLowerCase().replace(/-/g, '_') : '';
      const pillar_key = rawPillar && PILLAR_KEYS.includes(rawPillar as any)
        ? (rawPillar as PillarKey)
        : null;
      const rawGrounding = typeof obj.grounding_type === 'string' ? obj.grounding_type.trim().toLowerCase().replace(/-/g, '_') : '';
      const grounding_type = (VALID_GROUNDING_TYPES.has(rawGrounding)
        ? rawGrounding
        : 'explicit_statement') as GroundedEvidenceItem['grounding_type'];
      const rawConf = typeof obj.confidence === 'number' && !Number.isNaN(obj.confidence) ? obj.confidence : 80;
      const confidence = Math.max(0, Math.min(100, Math.round(rawConf)));

      result.push({
        quote,
        speaker,
        pillar_key,
        grounding_type,
        confidence,
      });
    }
  }

  return result;
}

export function normalizePillars(raw: unknown): DealPillars {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, any>) : {};
  const result: Partial<DealPillars> = {};

  for (const key of PILLAR_KEYS) {
    const entry = src[key];
    const status: PillarStatus = entry && typeof entry.status === 'string' && VALID_PILLAR_STATUSES.has(entry.status)
      ? entry.status
      : 'unconfirmed';
    const evidence = entry && typeof entry.evidence === 'string' ? entry.evidence : '';

    const [min, max] = PILLAR_CONFIDENCE_RANGE[status];
    const rawConfidence = entry?.confidence;
    let confidence: number;
    if (typeof rawConfidence === 'number' && !Number.isNaN(rawConfidence) && rawConfidence >= min && rawConfidence <= max) {
      confidence = Math.round(rawConfidence);
    } else {
      confidence = PILLAR_CONFIDENCE_FALLBACK[status];
    }

    result[key] = { status, confidence, evidence };
  }

  return result as DealPillars;
}

export function normalizeCall(raw: unknown): DealReview['call'] {
  const call = raw as Record<string, any> | undefined;
  if (!call || typeof call !== 'object') throw new Error('Missing call object.');

  if (typeof call.call_status !== 'string' || !VALID_CALL_STATUSES.has(call.call_status)) {
    throw new Error('Invalid call.call_status.');
  }
  if (typeof call.verdict !== 'string' || !call.verdict.trim()) {
    throw new Error('Missing call.verdict.');
  }
  if (typeof call.reason !== 'string' || !call.reason.trim()) {
    throw new Error('Missing call.reason.');
  }

  const highest_priority_risk = normalizeRisk(call.highest_priority_risk, 'call.highest_priority_risk');
  const what_youre_missing = normalizeMissingInfo(call.what_youre_missing, 'call.what_youre_missing');

  let manager_note = typeof call.manager_note === 'string' ? call.manager_note : '';
  if (!manager_note.trim()) throw new Error('Missing call.manager_note.');
  if (wordCount(manager_note) > 20) {
    manager_note = manager_note.trim().split(/\s+/).slice(0, 20).join(' ');
  }

  return {
    call_status: call.call_status as CallStatus,
    verdict: call.verdict,
    reason: call.reason,
    highest_priority_risk,
    what_youre_missing,
    recommended_next_action: typeof call.recommended_next_action === 'string' ? call.recommended_next_action : '',
    key_follow_up_message: typeof call.key_follow_up_message === 'string' ? call.key_follow_up_message : '',
    manager_note,
  };
}

export function normalizeSuggestedStage(raw: unknown): DealStage {
  if (typeof raw === 'string' && VALID_DEAL_STAGES.has(raw)) return raw as DealStage;
  return 'Qualification';
}

export function normalizeDeal(raw: unknown): DealReview['deal'] {
  const deal = raw as Record<string, any> | undefined;
  if (!deal || typeof deal !== 'object') throw new Error('Missing deal object.');

  if (typeof deal.status !== 'string' || !VALID_DEAL_STATUSES.has(deal.status)) {
    throw new Error('Invalid deal.status.');
  }
  if (typeof deal.confidence !== 'string' || !VALID_CONFIDENCE.has(deal.confidence)) {
    throw new Error('Invalid deal.confidence.');
  }
  if (typeof deal.status_reason !== 'string' || !deal.status_reason.trim()) {
    throw new Error('Missing deal.status_reason.');
  }
  if (typeof deal.health_score !== 'number' || Number.isNaN(deal.health_score)) {
    throw new Error('Missing or invalid deal.health_score.');
  }
  const health_score = Math.max(0, Math.min(100, Math.round(deal.health_score)));

  const highest_priority_risk = normalizeRisk(deal.highest_priority_risk, 'deal.highest_priority_risk');
  const what_youre_missing = normalizeMissingInfo(deal.what_youre_missing, 'deal.what_youre_missing');
  const pillars = normalizePillars(deal.pillars);
  const stage_justification = typeof deal.stage_justification === 'string' ? deal.stage_justification.trim() : '';
  const suggested_deal_stage = normalizeSuggestedStage(deal.suggested_deal_stage);
  const stage_regression_override = deal.stage_regression_override === true;

  let manager_note = typeof deal.manager_note === 'string' ? deal.manager_note : '';
  if (!manager_note.trim()) throw new Error('Missing deal.manager_note.');
  if (wordCount(manager_note) > 20) {
    manager_note = manager_note.trim().split(/\s+/).slice(0, 20).join(' ');
  }

  return {
    status: deal.status as DealStatus,
    confidence: deal.confidence as DealConfidence,
    status_reason: deal.status_reason,
    health_score,
    highest_priority_risk,
    what_youre_missing,
    recommended_next_action: typeof deal.recommended_next_action === 'string' ? deal.recommended_next_action : '',
    manager_note,
    pillars,
    stage_justification,
    suggested_deal_stage,
    stage_regression_override,
  };
}

export function normalizeStakeholders(raw: unknown): StakeholderSignal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
    .map((s: any) => ({
      name: s.name.trim(),
      role: typeof s.role === 'string' ? s.role.trim() : null,
      sentiment: VALID_SENTIMENTS.has(s.sentiment) ? s.sentiment : null,
      evidence: typeof s.evidence === 'string' ? s.evidence : '',
    }));
}

export function normalizeExtraction(raw: any, isFirstCall = true): DealReview {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction format returned by model.');
  }

  const call = normalizeCall(raw.call);
  const deal = normalizeDeal(raw.deal);
  const stakeholder_signals = normalizeStakeholders(raw.stakeholder_signals);
  const supporting_evidence = normalizeSupportingEvidence(raw.supporting_evidence);

  const review: DealReview = {
    call,
    deal,
    stakeholder_signals,
    supporting_evidence,
  };

  if (!isFirstCall) {
    const delta = raw.what_changed_since_last_call;
    if (delta && typeof delta === 'object') {
      review.what_changed_since_last_call = {
        resolved: Array.isArray(delta.resolved) ? delta.resolved : [],
        persists: Array.isArray(delta.persists) ? delta.persists : [],
        new_risks: Array.isArray(delta.new_risks) ? delta.new_risks : [],
      };
    } else {
      review.what_changed_since_last_call = { resolved: [], persists: [], new_risks: [] };
    }
  }

  const consistencyResult = validateDealStateConsistency(review);
  return consistencyResult.review;
}
