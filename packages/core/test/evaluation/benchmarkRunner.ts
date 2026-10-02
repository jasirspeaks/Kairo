import { DealReview } from '../../src/types';
import { EvaluationBenchmarkScenario, ALL_BENCHMARK_SCENARIOS } from './fixtures';
import { evaluateJudgment, EvaluationResult } from './evaluator';

export interface BenchmarkReport {
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  overallScore: number; // 0 - 100
  metrics: {
    falsePositiveRate: number; // percentage of trap scenarios wrongly marked Healthy
    falseNegativeRate: number; // percentage of high-risk scenarios marked low risk
    hallucinationRate: number; // percentage of evidence failures
    pillarAccuracyRate: number; // percentage of pillar checks passed
    stakeholderAccuracyRate: number;
  };
  scenarioResults: EvaluationResult[];
  regressionGatePassed: boolean;
}

export interface BenchmarkRunnerOptions {
  scenarios?: EvaluationBenchmarkScenario[];
  maxAllowedFPRate?: number; // default 0%
  maxAllowedFNRate?: number; // default 0%
  minOverallScore?: number; // default 90%
}

export function runBenchmarkSuite(
  scenarioReviews: Map<string, DealReview>,
  options: BenchmarkRunnerOptions = {}
): BenchmarkReport {
  const scenarios = options.scenarios || ALL_BENCHMARK_SCENARIOS;
  const results: EvaluationResult[] = [];

  let falsePositives = 0;
  let falseNegatives = 0;
  let hallucinationFailures = 0;
  let pillarChecksPassed = 0;
  let totalPillarChecks = 0;
  let stakeholderChecksPassed = 0;
  let totalStakeholderChecks = 0;

  for (const scenario of scenarios) {
    const review = scenarioReviews.get(scenario.id) || scenario.mockReview;
    const evalResult = evaluateJudgment(review, scenario);
    results.push(evalResult);

    // False Positive tracking: Disallowed statuses included Healthy/Promising, but review produced it
    if (
      scenario.expectedJudgment.disallowedStatuses.includes('Healthy') &&
      (review.deal.status === 'Healthy' || review.deal.status === 'Promising')
    ) {
      falsePositives++;
    }

    // False Negative tracking: Scenario has Critical risk or low max health score, but review gave >75 health
    if (
      scenario.expectedJudgment.maxHealthScore !== undefined &&
      scenario.expectedJudgment.maxHealthScore < 50 &&
      review.deal.health_score > 70
    ) {
      falseNegatives++;
    }

    // Evidence Grounding & Hallucination tracking
    if (!evalResult.metrics.evidenceGrounded) {
      hallucinationFailures++;
    }

    // Pillar accuracy
    totalPillarChecks++;
    if (evalResult.metrics.pillarsValid) {
      pillarChecksPassed++;
    }

    // Stakeholder accuracy
    if (scenario.expectedJudgment.expectedStakeholders) {
      totalStakeholderChecks++;
      if (evalResult.metrics.stakeholdersValid) {
        stakeholderChecksPassed++;
      }
    }
  }

  const total = scenarios.length;
  const passed = results.filter((r) => r.passed).length;
  const avgScore = total > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / total) : 0;

  const fpRate = total > 0 ? Math.round((falsePositives / total) * 100) : 0;
  const fnRate = total > 0 ? Math.round((falseNegatives / total) * 100) : 0;
  const hallucinationRate = total > 0 ? Math.round((hallucinationFailures / total) * 100) : 0;
  const pillarAcc = totalPillarChecks > 0 ? Math.round((pillarChecksPassed / totalPillarChecks) * 100) : 100;
  const stakeholderAcc =
    totalStakeholderChecks > 0 ? Math.round((stakeholderChecksPassed / totalStakeholderChecks) * 100) : 100;

  const maxAllowedFP = options.maxAllowedFPRate ?? 0;
  const maxAllowedFN = options.maxAllowedFNRate ?? 0;
  const minScore = options.minOverallScore ?? 90;

  const regressionGatePassed = fpRate <= maxAllowedFP && fnRate <= maxAllowedFN && avgScore >= minScore;

  return {
    timestamp: new Date().toISOString(),
    totalScenarios: total,
    passedScenarios: passed,
    failedScenarios: total - passed,
    overallScore: avgScore,
    metrics: {
      falsePositiveRate: fpRate,
      falseNegativeRate: fnRate,
      hallucinationRate,
      pillarAccuracyRate: pillarAcc,
      stakeholderAccuracyRate: stakeholderAcc,
    },
    scenarioResults: results,
    regressionGatePassed,
  };
}

export function formatBenchmarkSummary(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('====================================================');
  lines.push('        KAIRO AI JUDGMENT BENCHMARK REPORT         ');
  lines.push('====================================================');
  lines.push(`Timestamp:              ${report.timestamp}`);
  lines.push(`Total Scenarios:        ${report.totalScenarios}`);
  lines.push(`Passed Scenarios:       ${report.passedScenarios}/${report.totalScenarios}`);
  lines.push(`Overall Score:          ${report.overallScore}%`);
  lines.push('----------------------------------------------------');
  lines.push(`False Positive Rate:    ${report.metrics.falsePositiveRate}% (Target: 0%)`);
  lines.push(`False Negative Rate:    ${report.metrics.falseNegativeRate}% (Target: 0%)`);
  lines.push(`Hallucination Rate:     ${report.metrics.hallucinationRate}% (Target: 0%)`);
  lines.push(`Pillar Accuracy:        ${report.metrics.pillarAccuracyRate}%`);
  lines.push(`Stakeholder Accuracy:   ${report.metrics.stakeholderAccuracyRate}%`);
  lines.push('----------------------------------------------------');
  lines.push(`Regression Gate Status: ${report.regressionGatePassed ? 'PASSED ✅' : 'FAILED ❌'}`);
  lines.push('====================================================');

  if (report.failedScenarios > 0) {
    lines.push('\nFailure Diagnostics:');
    for (const res of report.scenarioResults) {
      if (!res.passed) {
        lines.push(`\n[Scenario: ${res.scenarioId}]`);
        for (const failure of res.failures) {
          lines.push(`  - ❌ ${failure}`);
        }
      }
    }
  }

  return lines.join('\n');
}
