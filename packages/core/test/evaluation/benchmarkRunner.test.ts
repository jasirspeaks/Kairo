import { describe, it, expect } from 'vitest';
import { ALL_BENCHMARK_SCENARIOS, SCENARIO_HAPPY_EARS } from './fixtures';
import { runBenchmarkSuite, formatBenchmarkSummary } from './benchmarkRunner';
import { DealReview } from '../../src/types';

describe('AI Evaluation Benchmark Suite & Regression Gate', () => {
  it('passes gold-standard benchmark suite across all scenarios with 100% score', () => {
    const reviewsMap = new Map<string, DealReview>();
    for (const scenario of ALL_BENCHMARK_SCENARIOS) {
      reviewsMap.set(scenario.id, scenario.mockReview);
    }

    const report = runBenchmarkSuite(reviewsMap, {
      maxAllowedFPRate: 0,
      maxAllowedFNRate: 0,
      minOverallScore: 90,
    });

    expect(report.totalScenarios).toBe(ALL_BENCHMARK_SCENARIOS.length);
    expect(report.passedScenarios).toBe(ALL_BENCHMARK_SCENARIOS.length);
    expect(report.failedScenarios).toBe(0);
    expect(report.overallScore).toBe(100);
    expect(report.metrics.falsePositiveRate).toBe(0);
    expect(report.metrics.falseNegativeRate).toBe(0);
    expect(report.metrics.hallucinationRate).toBe(0);
    expect(report.metrics.pillarAccuracyRate).toBe(100);
    expect(report.regressionGatePassed).toBe(true);
  });

  it('triggers regression gate failure when a candidate model produces a False Positive', () => {
    const reviewsMap = new Map<string, DealReview>();
    for (const scenario of ALL_BENCHMARK_SCENARIOS) {
      reviewsMap.set(scenario.id, scenario.mockReview);
    }

    // Corrupt Happy Ears review to return false positive 'Healthy'
    reviewsMap.set(SCENARIO_HAPPY_EARS.id, {
      ...SCENARIO_HAPPY_EARS.mockReview,
      deal: {
        ...SCENARIO_HAPPY_EARS.mockReview.deal,
        status: 'Healthy' as const,
        health_score: 95,
      },
    });

    const report = runBenchmarkSuite(reviewsMap, {
      maxAllowedFPRate: 0,
      minOverallScore: 90,
    });

    expect(report.metrics.falsePositiveRate).toBeGreaterThan(0);
    expect(report.regressionGatePassed).toBe(false);
    expect(report.failedScenarios).toBeGreaterThan(0);
  });

  it('formats human-readable diagnostic report with failure logs', () => {
    const reviewsMap = new Map<string, DealReview>();
    for (const scenario of ALL_BENCHMARK_SCENARIOS) {
      reviewsMap.set(scenario.id, scenario.mockReview);
    }

    const report = runBenchmarkSuite(reviewsMap);
    const summary = formatBenchmarkSummary(report);

    expect(summary).toContain('KAIRO AI JUDGMENT BENCHMARK REPORT');
    expect(summary).toContain('Regression Gate Status: PASSED');
    expect(summary).toContain('False Positive Rate:    0%');
  });
});
