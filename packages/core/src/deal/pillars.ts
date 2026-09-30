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
