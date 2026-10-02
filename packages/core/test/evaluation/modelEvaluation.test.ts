import { describe, it, expect } from 'vitest';
import { ALL_BENCHMARK_SCENARIOS } from './fixtures';
import { evaluateJudgment } from './evaluator';
import { DealReview } from '../../src/types';

describe('P0 — Live Model Quality Evaluation (Separated from Deterministic Benchmarks)', () => {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    it.skip('Model evaluation harness: GEMINI_API_KEY is not configured. Live model evaluation is explicitly SKIPPED to prevent false positive pass rates.', () => {
      // Intentionally skipped when live AI execution is unavailable.
      // NEVER substitute scenario.mockReview and claim the model passed!
    });
  } else {
    it('executes live AI review against gold-standard scenarios and validates judgment quality', async () => {
      for (const scenario of ALL_BENCHMARK_SCENARIOS.slice(0, 3)) {
        // Call live AI review endpoint
        const response = await fetch('http://localhost:54321/functions/v1/call-review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || 'test-key'}`,
          },
          body: JSON.stringify({
            transcript: scenario.transcript,
          }),
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        const review: DealReview = data.review;

        expect(review).toBeDefined();
        const evalResult = evaluateJudgment(review, scenario);

        expect(evalResult.metrics.healthScoreValid).toBe(true);
        expect(evalResult.metrics.statusClassificationValid).toBe(true);
        expect(evalResult.metrics.evidenceGrounded).toBe(true);
      }
    }, 60000);
  }
});
