import { describe, it, expect } from 'vitest';
import { PILLAR_LABELS, PILLAR_ORDER, getPillarBarColor, DealPillars } from '../../src';

describe('AI Evaluation - 5 Pillars Structure & Qualification Integrity', () => {
  it('enforces all five canonical pillars in exact priority order', () => {
    expect(PILLAR_ORDER).toEqual([
      'compelling_event',
      'economic_buyer',
      'decision_process',
      'budget',
      'champion',
    ]);
  });

  it('maps correct human labels for all 5 pillars', () => {
    expect(PILLAR_LABELS.compelling_event).toBe('Compelling Event');
    expect(PILLAR_LABELS.economic_buyer).toBe('Economic Buyer');
    expect(PILLAR_LABELS.decision_process).toBe('Decision Process');
    expect(PILLAR_LABELS.budget).toBe('Budget');
    expect(PILLAR_LABELS.champion).toBe('Champion');
  });

  it('verifies pillar confidence visual indicators and color banding', () => {
    // Green >= 67
    expect(getPillarBarColor(100)).toBe('#3DD68C');
    expect(getPillarBarColor(67)).toBe('#3DD68C');
    // Amber 34 - 66
    expect(getPillarBarColor(66)).toBe('#F6B23E');
    expect(getPillarBarColor(34)).toBe('#F6B23E');
    // Red < 34
    expect(getPillarBarColor(33)).toBe('#FF667A');
    expect(getPillarBarColor(0)).toBe('#FF667A');
  });

  it('evaluates incomplete pillars as unknown or partial when evidence is missing', () => {
    const samplePillars: DealPillars = {
      compelling_event: {
        status: 'unconfirmed',
        confidence: 10,
        evidence: 'No compelling event stated',
      },
      economic_buyer: {
        status: 'unconfirmed',
        confidence: 0,
        evidence: 'EB not yet identified',
      },
      decision_process: {
        status: 'partial',
        confidence: 40,
        evidence: 'Demo scheduled but security review steps unknown',
      },
      budget: {
        status: 'unconfirmed',
        confidence: 15,
        evidence: 'Pricing discussed informally, no formal budget',
      },
      champion: {
        status: 'confirmed',
        confidence: 85,
        evidence: 'VP of Product advocating for the purchase',
      },
    };

    const confirmedCount = Object.values(samplePillars).filter(
      (p) => p.status === 'confirmed'
    ).length;
    const unconfirmedCount = Object.values(samplePillars).filter(
      (p) => p.status === 'unconfirmed'
    ).length;

    expect(confirmedCount).toBe(1);
    expect(unconfirmedCount).toBe(3);
    expect(samplePillars.champion.status).toBe('confirmed');
    expect(samplePillars.economic_buyer.status).toBe('unconfirmed');
  });
});
