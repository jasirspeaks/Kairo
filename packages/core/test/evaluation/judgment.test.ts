import { describe, it, expect } from 'vitest';
import {
  SCENARIO_HAPPY_EARS,
  SCENARIO_WELL_QUALIFIED,
  SCENARIO_HIDDEN_BLOCKER,
} from './fixtures';
import { evaluateJudgment } from './evaluator';

describe('AI Judgment Evaluation - False Positives & Risk Grounding', () => {
  it('Scenario 1: Penalizes "Happy Ears" deal with missing EB, budget, and process', () => {
    const result = evaluateJudgment(SCENARIO_HAPPY_EARS.mockReview, SCENARIO_HAPPY_EARS);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.metrics.statusClassificationValid).toBe(true);
    expect(result.metrics.pillarsValid).toBe(true);
    expect(result.metrics.healthScoreValid).toBe(true);
  });

  it('Scenario 2: Accurately validates multi-pillar grounded enterprise deal as Healthy', () => {
    const result = evaluateJudgment(SCENARIO_WELL_QUALIFIED.mockReview, SCENARIO_WELL_QUALIFIED);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.metrics.statusClassificationValid).toBe(true);
    expect(result.metrics.stakeholdersValid).toBe(true);
  });

  it('Scenario 3: Identifies hidden executive blocker and flags Critical risk', () => {
    const result = evaluateJudgment(SCENARIO_HIDDEN_BLOCKER.mockReview, SCENARIO_HIDDEN_BLOCKER);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.metrics.riskAccuracyValid).toBe(true);
    expect(result.metrics.stakeholdersValid).toBe(true);
  });

  it('Fails when an optimistic false-positive review labels an unqualified call as Healthy', () => {
    // Malformed review that incorrectly marks an unqualified deal as Healthy
    const optimisticFlawedReview = {
      ...SCENARIO_HAPPY_EARS.mockReview,
      deal: {
        ...SCENARIO_HAPPY_EARS.mockReview.deal,
        status: 'Healthy' as const,
        health_score: 90,
      },
    };

    const result = evaluateJudgment(optimisticFlawedReview, SCENARIO_HAPPY_EARS);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.some((f) => f.includes('Health score too high'))).toBe(true);
    expect(result.failures.some((f) => f.includes('Forbidden deal status'))).toBe(true);
  });
});
