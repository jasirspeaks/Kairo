import { DealPillars } from '../types';

export const PILLAR_LABELS: Record<keyof DealPillars, string> = {
  compelling_event: 'Compelling Event',
  economic_buyer: 'Economic Buyer',
  decision_process: 'Decision Process',
  budget: 'Budget',
  champion: 'Champion',
};

export const PILLAR_ORDER: (keyof DealPillars)[] = [
  'compelling_event',
  'economic_buyer',
  'decision_process',
  'budget',
  'champion',
];

export function getPillarBarColor(confidence: number): string {
  if (confidence >= 67) return '#3DD68C'; // High confidence / Healthy (Green)
  if (confidence >= 34) return '#F6B23E'; // Medium confidence / Warning (Amber)
  return '#FF667A';                      // Low confidence / Critical (Red)
}

export interface PipelinePillarSummary {
  key: keyof DealPillars;
  label: string;
  confirmedCount: number;
  partialCount: number;
  unconfirmedCount: number;
  totalDeals: number;
}

export function summarizePipelinePillars(
  deals: Array<{ deal_state?: { pillars?: DealPillars | null } | null }>
): PipelinePillarSummary[] {
  const totalDeals = deals.length;
  return PILLAR_ORDER.map((key) => {
    let confirmedCount = 0;
    let partialCount = 0;
    let unconfirmedCount = 0;

    for (const deal of deals) {
      const status = deal.deal_state?.pillars?.[key]?.status;
      if (status === 'confirmed') {
        confirmedCount++;
      } else if (status === 'partial') {
        partialCount++;
      } else {
        unconfirmedCount++;
      }
    }

    return {
      key,
      label: PILLAR_LABELS[key],
      confirmedCount,
      partialCount,
      unconfirmedCount,
      totalDeals,
    };
  });
}
