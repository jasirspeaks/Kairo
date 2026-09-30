export function getHealthScoreColor(score: number): string {
  if (score >= 70) return '#3DD68C'; // High Health (Green)
  if (score >= 40) return '#F6B23E'; // Moderate Health (Amber)
  return '#FF667A';                  // Critical / Low Health (Red)
}

export function formatDealValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: value >= 100000 ? 'compact' : 'standard',
  }).format(value);
}
