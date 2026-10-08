import { describe, it, expect, vi } from 'vitest';
import { getDealLongitudinalHistory, saveDealState } from '../src/services/deals';
import type { DealReview } from '@kairo/core';

describe('getDealLongitudinalHistory service suite', () => {
  const dealId = 'deal-test-123';

  it('correctly returns longitudinal data when all queries succeed', async () => {
    const mockClient: any = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            const builder: any = {
              maybeSingle: vi.fn(async () => {
                if (table === 'deals') {
                  return { data: { id: dealId, deal_name: 'Acme Deal', user_id: 'user-1' }, error: null };
                }
                if (table === 'deal_state') {
                  return { data: { deal_id: dealId, current_status: 'Healthy' }, error: null };
                }
                return { data: null, error: null };
              }),
              order: vi.fn(() => ({
                data: table === 'deal_evidence'
                  ? [{ id: 'ev-1', deal_id: dealId, quote: 'We need this by Q4', pillar_key: 'compelling_event' }]
                  : [],
                error: null,
              })),
              is: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            };
            return builder;
          }),
        })),
      })),
    };

    const result = await getDealLongitudinalHistory(dealId, mockClient);

    expect(result.deal.id).toBe(dealId);
    expect(result.state?.current_status).toBe('Healthy');
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].quote).toBe('We need this by Q4');
    expect(result.evidence[0].pillar_key).toBe('compelling_event');
  });

  it('throws when dealRes fails or deal is missing', async () => {
    const mockClient: any = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            order: vi.fn(() => ({ data: [], error: null })),
            is: vi.fn(() => ({ order: vi.fn(() => ({ data: [], error: null })) })),
          })),
        })),
      })),
    };

    await expect(getDealLongitudinalHistory(dealId, mockClient)).rejects.toThrow('Deal not found');
  });

  it('propagates error when evidenceRes query fails rather than returning empty array', async () => {
    const mockClient: any = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            const builder: any = {
              maybeSingle: vi.fn(async () => {
                if (table === 'deals') {
                  return { data: { id: dealId, deal_name: 'Acme Deal', user_id: 'user-1' }, error: null };
                }
                return { data: null, error: null };
              }),
              order: vi.fn(() => {
                if (table === 'deal_evidence') {
                  return { data: null, error: new Error('RLS policy violation on deal_evidence') };
                }
                return { data: [], error: null };
              }),
              is: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            };
            return builder;
          }),
        })),
      })),
    };

    await expect(getDealLongitudinalHistory(dealId, mockClient)).rejects.toThrow('RLS policy violation on deal_evidence');
  });
});

describe('exportUserPipeline service suite', () => {
  const userId = 'user-test-456';

  it('exports comprehensive user pipeline data including conversations, stakeholders, evidence, and risks', async () => {
    const mockClient: any = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, _val: string) => {
            if (table === 'deal_state') {
              return Promise.resolve({ data: [{ deal_id: 'd1', current_status: 'Healthy' }], error: null });
            }
            return {
              order: vi.fn(() => {
                if (table === 'deals') return Promise.resolve({ data: [{ id: 'd1', deal_name: 'Big Deal' }], error: null });
                if (table === 'meetings') return Promise.resolve({ data: [{ id: 'm1', title: 'Sync' }], error: null });
                if (table === 'conversations') return Promise.resolve({ data: [{ id: 'c1', transcript: 'Hello' }], error: null });
                if (table === 'stakeholders') return Promise.resolve({ data: [{ id: 's1', name: 'Alice' }], error: null });
                if (table === 'deal_evidence') return Promise.resolve({ data: [{ id: 'e1', quote: 'Must buy' }], error: null });
                if (table === 'deal_risks') return Promise.resolve({ data: [{ id: 'r1', risk_text: 'Budget' }], error: null });
                return Promise.resolve({ data: [], error: null });
              }),
            };
          }),
        })),
      })),
    };

    const res = await (await import('../src/services/deals')).exportUserPipeline(userId, mockClient);

    expect(res.deals).toHaveLength(1);
    expect(res.dealStates).toHaveLength(1);
    expect(res.meetings).toHaveLength(1);
    expect(res.conversations).toHaveLength(1);
    expect(res.stakeholders).toHaveLength(1);
    expect(res.dealEvidence).toHaveLength(1);
    expect(res.dealRisks).toHaveLength(1);
    expect(res.exportDate).toBeDefined();
  });
});

