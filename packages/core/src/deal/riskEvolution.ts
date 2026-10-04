import { Conversation, RiskDeltaItem } from '../types';

export interface NormalizedRiskDelta {
  risk: string;
  category?: string;
  why_it_matters?: string;
}

export interface EvolutionEntry {
  call: Conversation;
  resolved: NormalizedRiskDelta[];
  persists: NormalizedRiskDelta[];
  newRisks: NormalizedRiskDelta[];
  isFirstRead: boolean;
}

/**
 * Normalizes any risk delta item (string, RiskDeltaItem object, legacy object)
 * into a safe, strongly-typed NormalizedRiskDelta object.
 * Returns null if the item has no meaningful content.
 */
export function normalizeRiskDeltaItem(item: unknown): NormalizedRiskDelta | null {
  if (!item) return null;

  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (!trimmed) return null;
    return { risk: trimmed };
  }

  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const risk = typeof obj.risk === 'string' && obj.risk.trim()
      ? obj.risk.trim()
      : typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim()
        : '';
    if (!risk) return null;

    const category = typeof obj.category === 'string' && obj.category.trim()
      ? obj.category.trim()
      : undefined;
    const why_it_matters = typeof obj.why_it_matters === 'string' && obj.why_it_matters.trim()
      ? obj.why_it_matters.trim()
      : undefined;

    return {
      risk,
      category,
      why_it_matters,
    };
  }

  return null;
}

/**
 * Normalizes an array of risk delta items, filtering out null/empty entries.
 */
export function normalizeRiskDeltaList(items: unknown): NormalizedRiskDelta[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeRiskDeltaItem)
    .filter((item): item is NormalizedRiskDelta => item !== null);
}

/**
 * Builds the call-by-call Risk Evolution timeline from a deal's conversation history.
 * - For multi-call deals: processes `what_changed_since_last_call` (resolved, persists, new_risks)
 * - For first call: falls back to extracting initial highest priority risk and missing gaps
 * - Handles strings, objects, mixed arrays, missing/null values safely
 * - Returns entries ordered newest first
 */
export function buildEvolution(calls: Conversation[]): EvolutionEntry[] {
  if (!Array.isArray(calls)) return [];

  return calls
    .map((call, i) => {
      if (!call) return null;
      const changed = call.analysis_json?.what_changed_since_last_call;

      if (changed) {
        const resolved = normalizeRiskDeltaList(changed.resolved);
        const persists = normalizeRiskDeltaList(changed.persists);
        const newRisks = normalizeRiskDeltaList(changed.new_risks);

        const hasContent = resolved.length > 0 || persists.length > 0 || newRisks.length > 0;
        if (!hasContent) return null;
        return {
          call,
          resolved,
          persists,
          newRisks,
          isFirstRead: false,
        };
      }

      // First-call fallback: only for the earliest call in chronological order
      if (i !== 0) return null;

      const highestRisk = call.analysis_json?.deal?.highest_priority_risk;
      const riskText = typeof highestRisk === 'string'
        ? highestRisk
        : highestRisk?.risk;
      const gaps = (call.analysis_json?.deal?.what_youre_missing ?? [])
        .map((m: any) => (typeof m === 'string' ? m : m?.gap))
        .filter(Boolean);

      const items: NormalizedRiskDelta[] = [];
      if (riskText && typeof riskText === 'string' && riskText.trim()) {
        const why = typeof highestRisk === 'object' ? highestRisk?.why_it_matters : undefined;
        const cat = typeof highestRisk === 'object' ? highestRisk?.category : undefined;
        items.push({
          risk: riskText.trim(),
          why_it_matters: why && typeof why === 'string' && why.trim() ? why.trim() : undefined,
          category: cat && typeof cat === 'string' && cat.trim() ? cat.trim() : undefined,
        });
      }

      for (const gap of gaps) {
        if (typeof gap === 'string' && gap.trim()) {
          items.push({ risk: gap.trim() });
        }
      }

      if (items.length === 0) return null;

      return {
        call,
        resolved: [],
        persists: items,
        newRisks: [],
        isFirstRead: true,
      };
    })
    .filter((e): e is EvolutionEntry => e !== null)
    .reverse(); // newest first
}
