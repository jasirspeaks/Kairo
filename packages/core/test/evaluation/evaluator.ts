import { DealReview } from '../../src/types';
import { EvaluationBenchmarkScenario } from './fixtures';

export interface EvaluationResult {
  scenarioId: string;
  passed: boolean;
  score: number; // 0 - 100
  failures: string[];
  metrics: {
    healthScoreValid: boolean;
    statusClassificationValid: boolean;
    pillarsValid: boolean;
    stakeholdersValid: boolean;
    riskAccuracyValid: boolean;
    evidenceGrounded: boolean;
  };
}

export function evaluateJudgment(
  review: DealReview,
  scenario: EvaluationBenchmarkScenario
): EvaluationResult {
  const failures: string[] = [];
  const expected = scenario.expectedJudgment;

  // 1. Health Score Boundary Checks
  let healthScoreValid = true;
  if (expected.maxHealthScore !== undefined && review.deal.health_score > expected.maxHealthScore) {
    failures.push(
      `Health score too high: received ${review.deal.health_score}, expected <= ${expected.maxHealthScore}`
    );
    healthScoreValid = false;
  }
  if (expected.minHealthScore !== undefined && review.deal.health_score < expected.minHealthScore) {
    failures.push(
      `Health score too low: received ${review.deal.health_score}, expected >= ${expected.minHealthScore}`
    );
    healthScoreValid = false;
  }

  // 2. Status Classification Checks
  let statusClassificationValid = true;
  if (!expected.allowedStatuses.includes(review.deal.status)) {
    failures.push(
      `Invalid deal status: received '${review.deal.status}', allowed: [${expected.allowedStatuses.join(', ')}]`
    );
    statusClassificationValid = false;
  }
  if (expected.disallowedStatuses.includes(review.deal.status)) {
    failures.push(
      `Forbidden deal status: received '${review.deal.status}', disallowed: [${expected.disallowedStatuses.join(', ')}]`
    );
    statusClassificationValid = false;
  }

  // 3. Pillar Status Verification
  let pillarsValid = true;
  if (expected.requiredPillarStatuses && review.deal.pillars) {
    for (const [pillarKey, expectedStatus] of Object.entries(expected.requiredPillarStatuses)) {
      const actualPillar = review.deal.pillars[pillarKey as keyof typeof review.deal.pillars];
      if (!actualPillar || actualPillar.status !== expectedStatus) {
        failures.push(
          `Pillar '${pillarKey}' status mismatch: received '${actualPillar?.status}', expected '${expectedStatus}'`
        );
        pillarsValid = false;
      }
    }
  }

  // 4. Stakeholder Sentiment Identification
  let stakeholdersValid = true;
  if (expected.expectedStakeholders) {
    for (const expStakeholder of expected.expectedStakeholders) {
      const match = review.stakeholder_signals.find((s) =>
        s.name.toLowerCase().includes(expStakeholder.nameSnippet.toLowerCase())
      );
      if (!match) {
        failures.push(`Missing expected stakeholder signal for '${expStakeholder.nameSnippet}'`);
        stakeholdersValid = false;
      } else if (match.sentiment !== expStakeholder.expectedSentiment) {
        failures.push(
          `Stakeholder sentiment mismatch for '${match.name}': received '${match.sentiment}', expected '${expStakeholder.expectedSentiment}'`
        );
        stakeholdersValid = false;
      }
    }
  }

  // 5. Risk Keyword & Unknown Detection
  let riskAccuracyValid = true;
  if (expected.riskKeywords && expected.riskKeywords.length > 0) {
    const riskText = (
      (review.deal.highest_priority_risk?.risk || '') +
      ' ' +
      (review.deal.highest_priority_risk?.why_it_matters || '') +
      ' ' +
      (review.call.highest_priority_risk?.risk || '')
    ).toLowerCase();

    const matchedKeywords = expected.riskKeywords.filter((kw) => riskText.includes(kw.toLowerCase()));
    if (matchedKeywords.length === 0) {
      failures.push(
        `Risk failed to identify key risk drivers. Expected any of: [${expected.riskKeywords.join(', ')}]`
      );
      riskAccuracyValid = false;
    }
  }

  // 6. Evidence Grounding Check (must not be empty or generic boilerplate)
  let evidenceGrounded = true;
  if (!review.supporting_evidence || review.supporting_evidence.length === 0) {
    failures.push('Supporting evidence list is empty');
    evidenceGrounded = false;
  } else {
    for (const ev of review.supporting_evidence) {
      const quote = typeof ev === 'string' ? ev : (ev && typeof ev === 'object' && 'quote' in ev ? (ev as any).quote : '');
      if (!quote || quote.trim().length < 10) {
        failures.push(`Evidence snippet too short or generic: "${quote}"`);
        evidenceGrounded = false;
      }
    }
  }

  const checkCount = 6;
  const passedChecks = [
    healthScoreValid,
    statusClassificationValid,
    pillarsValid,
    stakeholdersValid,
    riskAccuracyValid,
    evidenceGrounded,
  ].filter(Boolean).length;

  const score = Math.round((passedChecks / checkCount) * 100);

  return {
    scenarioId: scenario.id,
    passed: failures.length === 0,
    score,
    failures,
    metrics: {
      healthScoreValid,
      statusClassificationValid,
      pillarsValid,
      stakeholdersValid,
      riskAccuracyValid,
      evidenceGrounded,
    },
  };
}
