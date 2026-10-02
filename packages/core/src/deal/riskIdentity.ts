import { DealRisk, DealRiskSeverity, DealRiskStatus } from '../types';

export const KNOWN_RISK_CATEGORIES = [
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
  'competitor_threat',
  'procurement_delay',
  'general_risk',
] as const;

export type RiskCategory = typeof KNOWN_RISK_CATEGORIES[number];

const KNOWN_CATEGORIES_SET = new Set<string>(KNOWN_RISK_CATEGORIES);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'that',
  'this', 'these', 'those', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your',
  'deal', 'risk', 'not', 'no', 'unclear', 'unconfirmed', 'missing', 'lack', 'competitor'
]);

/**
 * Normalizes title/concept to extract key semantic identifiers while stripping stopwords.
 */
export function extractRiskConcept(titleOrText: string): string {
  if (!titleOrText) return 'unknown';

  const cleaned = titleOrText
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .trim();

  const words = cleaned
    .split(/[\s_-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return cleaned.split(/\s+/).slice(0, 3).join('_') || 'unspecified';
  }

  return words.slice(0, 4).join('_');
}

/**
 * Computes a deterministic semantic risk fingerprint: category + normalized concept.
 * Distinct risks within the same category (e.g. competitor pricing vs competitor CXO) generate DISTINCT fingerprints.
 * The same underlying risk across calls generates the EXACT SAME fingerprint.
 */
export function computeRiskFingerprint(category: string | undefined | null, titleOrConcept: string): string {
  const normCat = category && KNOWN_CATEGORIES_SET.has(category.trim().toLowerCase())
    ? category.trim().toLowerCase()
    : 'general_risk';

  const normConcept = extractRiskConcept(titleOrConcept);
  return `${normCat}:${normConcept}`;
}

export interface ReconcileRiskInput {
  existingRisks: DealRisk[];
  currentCallId: string;
  newOrActiveRisks: Array<{
    title: string;
    why_it_matters?: string | null;
    category?: string | null;
    severity?: DealRiskSeverity;
  }>;
  resolvedRisks?: Array<{
    title?: string;
    risk?: string;
    category?: string;
  }>;
}

export interface ReconciledRisksResult {
  updatedRisks: DealRisk[];
  newRisks: DealRisk[];
  resolvedRisks: DealRisk[];
  allActiveRisks: DealRisk[];
}

export function reconcileDealRisks(input: ReconcileRiskInput): ReconciledRisksResult {
  const riskMap = new Map<string, DealRisk>();

  for (const r of input.existingRisks) {
    const fp = r.fingerprint || computeRiskFingerprint(r.risk_category, r.title);
    riskMap.set(fp, { ...r, fingerprint: fp });
  }

  const updatedRisks: DealRisk[] = [];
  const newRisks: DealRisk[] = [];
  const resolvedRisks: DealRisk[] = [];

  // 1. Process active / new risks
  for (const item of input.newOrActiveRisks) {
    if (!item.title || !item.title.trim()) continue;

    const fp = computeRiskFingerprint(item.category, item.title);
    const existing = riskMap.get(fp);

    if (existing) {
      const wasResolved = existing.status === 'resolved' || existing.status === 'mitigated';
      const consecutive = wasResolved ? 1 : existing.consecutive_unresolved_calls + 1;
      const nextStatus: DealRiskStatus = wasResolved ? 'active' : 'recurring';

      // Escalation rule: 3+ consecutive calls on high/critical -> critical; 2+ on medium -> high
      let escalatedSeverity: DealRiskSeverity = item.severity || existing.severity || 'high';
      if (consecutive >= 3 && (escalatedSeverity === 'high' || existing.severity === 'high')) {
        escalatedSeverity = 'critical';
      } else if (consecutive >= 2 && escalatedSeverity === 'medium') {
        escalatedSeverity = 'high';
      }

      const updated: DealRisk = {
        ...existing,
        title: item.title,
        why_it_matters: item.why_it_matters || existing.why_it_matters,
        status: nextStatus,
        severity: escalatedSeverity,
        consecutive_unresolved_calls: consecutive,
        risk_category: item.category || existing.risk_category,
        resolved_call_id: wasResolved ? null : existing.resolved_call_id,
        updated_at: new Date().toISOString(),
      };

      riskMap.set(fp, updated);
      updatedRisks.push(updated);
    } else {
      const created: DealRisk = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `risk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        deal_id: input.existingRisks[0]?.deal_id || '',
        title: item.title,
        why_it_matters: item.why_it_matters || null,
        status: 'active',
        severity: item.severity || 'high',
        first_identified_call_id: input.currentCallId,
        resolved_call_id: null,
        consecutive_unresolved_calls: 1,
        risk_category: item.category || 'general_risk',
        fingerprint: fp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      riskMap.set(fp, created);
      newRisks.push(created);
    }
  }

  // 2. Process resolved risks
  if (input.resolvedRisks) {
    for (const res of input.resolvedRisks) {
      const resTitle = (res.title || res.risk || '').trim();
      const resCat = (res.category || '').trim();
      const targetFp = computeRiskFingerprint(resCat, resTitle);

      for (const [fp, risk] of riskMap.entries()) {
        if (risk.status === 'active' || risk.status === 'recurring') {
          const matchFp = fp === targetFp;
          const matchTitle = resTitle && (
            risk.title.toLowerCase().includes(resTitle.toLowerCase()) ||
            resTitle.toLowerCase().includes(risk.title.toLowerCase())
          );

          if (matchFp || matchTitle) {
            const resolved: DealRisk = {
              ...risk,
              status: 'resolved',
              resolved_call_id: input.currentCallId,
              updated_at: new Date().toISOString(),
            };
            riskMap.set(fp, resolved);
            resolvedRisks.push(resolved);
          }
        }
      }
    }
  }

  const allActive = Array.from(riskMap.values()).filter(
    (r) => r.status === 'active' || r.status === 'recurring'
  );

  return {
    updatedRisks,
    newRisks,
    resolvedRisks,
    allActiveRisks: allActive,
  };
}
