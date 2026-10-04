import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewCall } from '../src/services/conversations';
import type { DealReview } from '@kairo/core';

describe('reviewCall service suite', () => {
  const mockSession = {
    access_token: 'valid-jwt-token-123',
    user: { id: 'user-123' },
  };

  const mockClient: any = {
    auth: {
      getSession: vi.fn(),
    },
  };

  const sampleReview: DealReview = {
    call: {
      call_status: 'On Track',
      verdict: 'Strong initial discovery meeting.',
      reason: 'Budget and timeline were both explicitly confirmed.',
      highest_priority_risk: {
        risk: 'Economic buyer has not joined calls directly.',
        why_it_matters: 'May delay procurement.',
        evidence: 'Buyer rep mentioned VP approval required.',
        category: 'economic_buyer',
      },
      what_youre_missing: [],
      recommended_next_action: 'Send proposal and schedule review with VP.',
      key_follow_up_message: 'Thanks for the time today.',
      manager_note: 'Solid discovery, ensure VP is on next call.',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'Timeline and need confirmed.',
      health_score: 85,
      highest_priority_risk: {
        risk: 'Economic buyer has not joined calls directly.',
        why_it_matters: 'May delay procurement.',
        evidence: 'Buyer rep mentioned VP approval required.',
        category: 'economic_buyer',
      },
      what_youre_missing: [],
      recommended_next_action: 'Send proposal.',
      manager_note: 'Track VP engagement.',
      suggested_deal_stage: 'Discovery',
      stage_regression_override: false,
      pillars: {
        compelling_event: { status: 'confirmed', confidence: 90, evidence: 'Contract expires in Q4' },
        economic_buyer: { status: 'partial', confidence: 50, evidence: 'VP named' },
        decision_process: { status: 'confirmed', confidence: 80, evidence: '2-step committee' },
        budget: { status: 'confirmed', confidence: 85, evidence: '$50k allocated' },
        champion: { status: 'confirmed', confidence: 75, evidence: 'Lead requested demo for team' },
      },
    },
    stakeholder_signals: [
      { name: 'Sarah', role: 'Head of Ops', sentiment: 'champion', evidence: 'Explicitly asked for rollout plan' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockClient.auth.getSession.mockResolvedValue({ data: { session: mockSession } });
  });

  it('throws a clear error when user is not signed in', async () => {
    mockClient.auth.getSession.mockResolvedValue({ data: { session: null } });

    await expect(
      reviewCall('Sample transcript that meets minimum length requirements...', undefined, undefined, mockClient)
    ).rejects.toThrow('You must be signed in to review a call.');
  });

  it('successfully returns a DealReview when backend succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ review: sampleReview }),
    });

    const result = await reviewCall(
      'Valid transcript with plenty of detail for reviewing...',
      { deal_name: 'Acme Deal', company_name: 'Acme Corp' },
      undefined,
      mockClient
    );

    expect(result).toEqual(sampleReview);
    expect(result.deal.health_score).toBe(85);
    expect(result.deal.pillars.budget.status).toBe('confirmed');
  });

  it('handles transport/network failure gracefully without raw "Failed to fetch"', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow("Couldn't reach Kairo's review service. Please check your internet connection and try again.");
  });

  it('handles request timeout gracefully', async () => {
    const timeoutErr = new Error('The operation was aborted due to timeout');
    timeoutErr.name = 'TimeoutError';
    global.fetch = vi.fn().mockRejectedValue(timeoutErr);

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('The review request timed out. Please try again.');
  });

  it('handles HTTP 401 with a clean session expiry message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('Unauthorized');
  });

  it('handles HTTP 403 subscription/permission errors cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'Your trial or subscription does not currently allow new reviews.' }),
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('Your trial or subscription does not currently allow new reviews.');
  });

  it('handles HTTP 429 rate limits cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'Rate limit reached. You can run up to 20 reviews per 24 hours.' }),
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('Rate limit reached. You can run up to 20 reviews per 24 hours.');
  });

  it('handles HTTP 500 server errors with structured error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'AI review generation failed: High load' }),
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('AI review generation failed: High load');
  });

  it('handles non-JSON gateway error (e.g. 504 Gateway Timeout HTML page) cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      text: async () => '<html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1></body></html>',
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('Review service is temporarily unavailable. Please try again in a moment.');
  });

  it('handles malformed AI response (missing review object) cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ invalid_key: true }),
    });

    await expect(
      reviewCall('Sample transcript text...', undefined, undefined, mockClient)
    ).rejects.toThrow('The review service returned an invalid response structure. Please try again.');
  });
});
