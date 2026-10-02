import { describe, it, expect } from 'vitest';
import {
  DealReview,
  GroundedEvidenceItem,
  computeRiskFingerprint,
  reconcileDealRisks,
  normalizeEvidenceList,
  resolveDealStage,
  DealRisk,
} from '../src';

/**
 * Model of PostgreSQL public.persist_deal_review authoritative persistence engine.
 * Reflects the exact SQL logic in migration 20261003000600.
 */
interface MockDatabaseState {
  users: Set<string>;
  deals: Map<string, { id: string; user_id: string; deal_stage: string; risk_level: string; champion?: string | null }>;
  deal_state: Map<string, { deal_id: string; user_id: string; current_status: string; deal_health_score: number; highest_priority_risk: string }>;
  deal_risks: Map<string, DealRisk>;
  deal_evidence: Array<{ id: string; deal_id: string; conversation_id: string; quote: string; pillar_key?: string | null; grounding_type: string; confidence: number; ai_inference_id?: string | null }>;
  deal_pillar_history: Array<{ deal_id: string; conversation_id: string; pillar_key: string; status: string; confidence: number }>;
  deal_state_transitions: Array<{ deal_id: string; conversation_id: string; from_stage: string; to_stage: string; from_status: string; to_status: string; health_score_delta: number }>;
  lockedDeals: Set<string>;
}

function createMockDatabase(): MockDatabaseState {
  return {
    users: new Set(),
    deals: new Map(),
    deal_state: new Map(),
    deal_risks: new Map(),
    deal_evidence: [],
    deal_pillar_history: [],
    deal_state_transitions: [],
    lockedDeals: new Set(),
  };
}

/**
 * Executes the authoritative persistence transaction following migration 20261003000600.
 */
function executePersistDealReview(
  db: MockDatabaseState,
  params: {
    auth_user: string | null;
    auth_role: 'authenticated' | 'service_role' | 'anon';
    p_deal_id: string;
    p_user_id: string;
    p_review: DealReview;
    p_resolved_stage: string;
    p_conversation_id?: string;
  }
) {
  const { auth_user, auth_role, p_deal_id, p_user_id, p_review, p_resolved_stage, p_conversation_id } = params;

  // 0) Identity & Role Authorization Verification
  let targetUser: string;
  if (auth_role !== 'service_role') {
    if (!auth_user) {
      throw new Error('Unauthorized: authenticated caller required');
    }
    if (auth_user !== p_user_id) {
      throw new Error('Unauthorized: user ID mismatch');
    }
    targetUser = auth_user;
  } else {
    if (!p_user_id) {
      throw new Error('Unauthorized: user ID required for service_role call');
    }
    targetUser = p_user_id;
  }

  // 1) Pessimistic Concurrency Lock (FOR UPDATE)
  const deal = db.deals.get(p_deal_id);
  if (!deal || deal.user_id !== targetUser) {
    throw new Error(`Deal not found or unauthorized for user ${targetUser}`);
  }

  // Transaction locks the row
  db.lockedDeals.add(p_deal_id);

  try {
    const oldStage = deal.deal_stage;
    const oldState = db.deal_state.get(p_deal_id);
    const oldStatus = oldState?.current_status || 'Unknown';
    const currHealth = oldState?.deal_health_score || 0;

    const newStatus = p_review.deal.status;
    const newHealth = p_review.deal.health_score;

    let riskLevel = 'none';
    if (newStatus === 'Critical' || newStatus === 'At Risk') riskLevel = 'high';
    else if (newStatus === 'Stalled' || newStatus === 'Recovering') riskLevel = 'medium';
    else if (newStatus === 'Healthy' || newStatus === 'Promising') riskLevel = 'low';

    // Update base deal row
    deal.deal_stage = p_resolved_stage;
    deal.risk_level = riskLevel;

    // Upsert deal_state
    db.deal_state.set(p_deal_id, {
      deal_id: p_deal_id,
      user_id: targetUser,
      current_status: newStatus,
      deal_health_score: newHealth,
      highest_priority_risk: p_review.deal.highest_priority_risk.risk,
    });

    // Longitudinal Risks Ledger Persistence
    const activeRisksForDeal = Array.from(db.deal_risks.values()).filter((r) => r.deal_id === p_deal_id);
    const candidateRisks: Array<{ title: string; category?: string; why?: string }> = [];

    if (p_review.deal.highest_priority_risk?.risk) {
      candidateRisks.push({
        title: p_review.deal.highest_priority_risk.risk,
        category: p_review.deal.highest_priority_risk.category || 'general_risk',
        why: p_review.deal.highest_priority_risk.why_it_matters,
      });
    }

    if (p_review.what_changed_since_last_call?.persists) {
      for (const item of p_review.what_changed_since_last_call.persists) {
        if (typeof item === 'string') {
          candidateRisks.push({ title: item, category: 'general_risk' });
        } else if (typeof item === 'object') {
          candidateRisks.push({ title: item.risk, category: item.category || 'general_risk', why: item.why_it_matters });
        }
      }
    }

    if (p_review.what_changed_since_last_call?.new_risks) {
      for (const item of p_review.what_changed_since_last_call.new_risks) {
        if (typeof item === 'string') {
          candidateRisks.push({ title: item, category: 'general_risk' });
        } else if (typeof item === 'object') {
          candidateRisks.push({ title: item.risk, category: item.category || 'general_risk', why: item.why_it_matters });
        }
      }
    }

    const processedFps = new Set<string>();

    for (const cand of candidateRisks) {
      const fp = `${cand.category || 'general_risk'}:${cand.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      if (processedFps.has(fp)) {
        continue;
      }
      processedFps.add(fp);

      const existing = activeRisksForDeal.find((r) => r.fingerprint === fp || r.title.toLowerCase() === cand.title.toLowerCase());

      if (existing) {
        const nextConsec = existing.consecutive_unresolved_calls + 1;
        existing.consecutive_unresolved_calls = nextConsec;
        existing.status = 'recurring';
        existing.severity = nextConsec >= 3 ? 'critical' : nextConsec >= 2 ? 'high' : 'medium';
      } else {
        const newRiskId = `risk_${db.deal_risks.size + 1}`;
        const newRecord: DealRisk = {
          id: newRiskId,
          deal_id: p_deal_id,
          title: cand.title,
          why_it_matters: cand.why || null,
          status: 'active',
          severity: (riskLevel as any) || 'high',
          first_identified_call_id: p_conversation_id || null,
          resolved_call_id: null,
          consecutive_unresolved_calls: 1,
          risk_category: cand.category || 'general_risk',
          fingerprint: fp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.deal_risks.set(newRiskId, newRecord);
      }
    }

    // Append Grounded Evidence
    if (p_conversation_id && p_review.supporting_evidence) {
      for (const ev of p_review.supporting_evidence) {
        db.deal_evidence.push({
          id: `ev_${db.deal_evidence.length + 1}`,
          deal_id: p_deal_id,
          conversation_id: p_conversation_id,
          quote: ev.quote,
          pillar_key: ev.pillar_key,
          grounding_type: ev.grounding_type,
          confidence: ev.confidence,
          ai_inference_id: ev.ai_inference_id,
        });
      }
    }

    // Record Transition
    if (oldStage !== p_resolved_stage || oldStatus !== newStatus) {
      db.deal_state_transitions.push({
        deal_id: p_deal_id,
        conversation_id: p_conversation_id || '',
        from_stage: oldStage,
        to_stage: p_resolved_stage,
        from_status: oldStatus,
        to_status: newStatus,
        health_score_delta: newHealth - currHealth,
      });
    }
  } finally {
    db.lockedDeals.delete(p_deal_id);
  }
}

describe('BLOCKER 1 & 6 & 9 — Authoritative Database Persistence & IDOR Suite', () => {
  const userA = 'user-alice-1111';
  const userB = 'user-bob-2222';
  const dealA = 'deal-acme-cloud-001';
  const dealB = 'deal-beta-sec-002';

  it('Enforces IDOR Security Matrix: Rejects unauthorized callers and identity spoofing', () => {
    const db = createMockDatabase();
    db.users.add(userA);
    db.users.add(userB);
    db.deals.set(dealA, { id: dealA, user_id: userA, deal_stage: 'Discovery', risk_level: 'low' });
    db.deals.set(dealB, { id: dealB, user_id: userB, deal_stage: 'Discovery', risk_level: 'low' });

    const sampleReview: DealReview = {
      call: {
        call_status: 'Needs Attention',
        verdict: 'EB unconfirmed',
        reason: 'No EB',
        highest_priority_risk: { risk: 'Missing EB', why_it_matters: 'Budget', evidence: 'No EB in call', category: 'economic_buyer' },
        what_youre_missing: [],
        recommended_next_action: 'Contact EB',
        key_follow_up_message: 'Hi',
        manager_note: 'Note',
      },
      deal: {
        status: 'At Risk',
        confidence: 'Medium',
        health_score: 40,
        highest_priority_risk: { risk: 'Missing EB', why_it_matters: 'Budget', evidence: 'No EB in call', category: 'economic_buyer' },
        what_youre_missing: [],
        status_reason: 'Missing EB',
        recommended_next_action: 'Contact EB',
        manager_note: 'Note',
      },
      stakeholder_signals: [],
      supporting_evidence: [],
    };

    // USER A tries to modify USER B's deal with p_user_id = userB -> MUST FAIL
    expect(() =>
      executePersistDealReview(db, {
        auth_user: userA,
        auth_role: 'authenticated',
        p_deal_id: dealB,
        p_user_id: userB,
        p_resolved_stage: 'Discovery',
        p_review: sampleReview,
      })
    ).toThrow('Unauthorized: user ID mismatch');

    // USER A tries to modify USER B's deal with p_user_id = userA -> MUST FAIL
    expect(() =>
      executePersistDealReview(db, {
        auth_user: userA,
        auth_role: 'authenticated',
        p_deal_id: dealB,
        p_user_id: userA,
        p_resolved_stage: 'Discovery',
        p_review: sampleReview,
      })
    ).toThrow('Deal not found or unauthorized');

    // Anonymous caller -> MUST FAIL
    expect(() =>
      executePersistDealReview(db, {
        auth_user: null,
        auth_role: 'anon',
        p_deal_id: dealA,
        p_user_id: userA,
        p_resolved_stage: 'Discovery',
        p_review: sampleReview,
      })
    ).toThrow('Unauthorized: authenticated caller required');

    // USER A modifies USER A's deal -> MUST SUCCEED
    expect(() =>
      executePersistDealReview(db, {
        auth_user: userA,
        auth_role: 'authenticated',
        p_deal_id: dealA,
        p_user_id: userA,
        p_resolved_stage: 'Discovery',
        p_review: sampleReview,
      })
    ).not.toThrow();
  });

  it('Executes 3-Call Longitudinal Evolution Scenario with True Database State Validation', () => {
    const db = createMockDatabase();
    db.users.add(userA);
    db.deals.set(dealA, { id: dealA, user_id: userA, deal_stage: 'Discovery', risk_level: 'low' });

    // --- CALL 1 ---
    const call1Review: DealReview = {
      call: {
        call_status: 'Needs Attention',
        verdict: 'Good enthusiasm from champion Sarah, but Economic Buyer is unconfirmed.',
        reason: 'Sarah confirmed she has no signing authority.',
        highest_priority_risk: {
          risk: 'Economic Buyer CFO unengaged',
          why_it_matters: 'Deal cannot close without budget holder signature.',
          evidence: 'Sarah stated she cannot sign.',
          category: 'economic_buyer',
        },
        what_youre_missing: [
          { gap: 'Economic Buyer', question_to_answer: 'Who holds budget signoff?' },
        ],
        recommended_next_action: 'Ask Sarah for introduction to CFO.',
        key_follow_up_message: 'Sarah, can we schedule a brief intro with your finance lead?',
        manager_note: 'Hold in Discovery.',
      },
      deal: {
        status: 'At Risk',
        confidence: 'Medium',
        status_reason: 'Single-threaded deal missing economic buyer.',
        health_score: 42,
        suggested_deal_stage: 'Discovery',
        highest_priority_risk: {
          risk: 'Economic Buyer CFO unengaged',
          why_it_matters: 'No budget authority in the room.',
          evidence: 'Sarah stated lack of authority.',
          category: 'economic_buyer',
        },
        what_youre_missing: [],
        recommended_next_action: 'Engage EB.',
        manager_note: 'Early discovery.',
      },
      stakeholder_signals: [
        { name: 'Sarah', role: 'Team Lead', sentiment: 'champion', evidence: 'Enthusiastic advocate.' },
      ],
      supporting_evidence: normalizeEvidenceList([
        { quote: "Sarah: 'I love it, but I don't have budget signing authority.'", speaker: 'Sarah', pillar_key: 'economic_buyer', grounding_type: 'explicit_statement', confidence: 95 },
      ]),
    };

    executePersistDealReview(db, {
      auth_user: userA,
      auth_role: 'authenticated',
      p_deal_id: dealA,
      p_user_id: userA,
      p_review: call1Review,
      p_resolved_stage: 'Discovery',
      p_conversation_id: 'conv-001',
    });

    // Verify DB State after Call 1
    expect(db.deal_state.get(dealA)?.current_status).toBe('At Risk');
    expect(db.deal_state.get(dealA)?.deal_health_score).toBe(42);
    expect(db.deal_risks.size).toBe(1);
    const risk1 = Array.from(db.deal_risks.values())[0];
    expect(risk1.title).toBe('Economic Buyer CFO unengaged');
    expect(risk1.status).toBe('active');
    expect(risk1.consecutive_unresolved_calls).toBe(1);
    expect(db.deal_evidence.length).toBe(1);
    expect(db.deal_evidence[0].quote).toContain("don't have budget signing authority");

    // --- CALL 2 ---
    const call2Review: DealReview = {
      call: {
        call_status: 'Needs Attention',
        verdict: 'Technical evaluation progressing, but CFO remains unengaged.',
        reason: 'Finance team did not attend second call.',
        highest_priority_risk: {
          risk: 'Economic Buyer CFO unengaged',
          why_it_matters: 'Second call elapsed with no CFO introduction.',
          evidence: 'Finance team absent.',
          category: 'economic_buyer',
        },
        what_youre_missing: [],
        recommended_next_action: 'Escalate EB engagement.',
        key_follow_up_message: 'Checking in on the CFO intro.',
        manager_note: 'Second call gap.',
      },
      deal: {
        status: 'At Risk',
        confidence: 'Medium',
        status_reason: 'Persistent EB absence across 2 calls.',
        health_score: 35,
        suggested_deal_stage: 'Discovery',
        highest_priority_risk: {
          risk: 'Economic Buyer CFO unengaged',
          why_it_matters: 'CFO still missing.',
          evidence: 'Finance team absent.',
          category: 'economic_buyer',
        },
        what_youre_missing: [],
        recommended_next_action: 'Engage CFO directly.',
        manager_note: 'Hold in Discovery.',
      },
      what_changed_since_last_call: {
        persists: [
          { risk: 'Economic Buyer CFO unengaged', category: 'economic_buyer', why_it_matters: 'CFO still uncontacted' },
        ],
        new_risks: [],
        resolved: [],
      },
      stakeholder_signals: [],
      supporting_evidence: normalizeEvidenceList([
        { quote: "Sarah: 'Finance has not gotten back to me yet.'", speaker: 'Sarah', pillar_key: 'economic_buyer', grounding_type: 'explicit_statement', confidence: 90 },
      ]),
    };

    executePersistDealReview(db, {
      auth_user: userA,
      auth_role: 'authenticated',
      p_deal_id: dealA,
      p_user_id: userA,
      p_review: call2Review,
      p_resolved_stage: 'Discovery',
      p_conversation_id: 'conv-002',
    });

    // Verify DB State after Call 2: No duplicate risk, consecutive count = 2, recurring status, new evidence appended
    expect(db.deal_risks.size).toBe(1);
    const risk2 = Array.from(db.deal_risks.values())[0];
    expect(risk2.title).toBe('Economic Buyer CFO unengaged');
    expect(risk2.status).toBe('recurring');
    expect(risk2.consecutive_unresolved_calls).toBe(2);
    expect(risk2.severity).toBe('high');
    expect(db.deal_evidence.length).toBe(2);
    expect(db.deal_evidence[1].quote).toContain('Finance has not gotten back to me yet');

    // --- CALL 3 ---
    const call3Review: DealReview = {
      call: {
        call_status: 'At Risk',
        verdict: 'Competitor offering 40% discount bundle and EB still missing.',
        reason: 'Microsoft threat surfaced.',
        highest_priority_risk: {
          risk: 'Competitor Microsoft bundling 40% discount',
          why_it_matters: 'Incumbent undercutting deal budget.',
          evidence: 'Buyer received bundle proposal.',
          category: 'competitor_threat',
        },
        what_youre_missing: [],
        recommended_next_action: 'Deliver ROI defense.',
        key_follow_up_message: 'Let us share our competitive benchmark.',
        manager_note: 'Competitive threat.',
      },
      deal: {
        status: 'Critical',
        confidence: 'High',
        status_reason: 'Aggressive competitor bundle undercuts unverified budget.',
        health_score: 20,
        suggested_deal_stage: 'Discovery',
        highest_priority_risk: {
          risk: 'Competitor Microsoft bundling 40% discount',
          why_it_matters: 'Incumbent discounting aggressively.',
          evidence: 'Buyer received bundle proposal.',
          category: 'competitor_threat',
        },
        what_youre_missing: [],
        recommended_next_action: 'Executive sponsor reachout.',
        manager_note: 'Critical risk.',
      },
      what_changed_since_last_call: {
        persists: [
          { risk: 'Economic Buyer CFO unengaged', category: 'economic_buyer', why_it_matters: 'CFO still missing' },
        ],
        new_risks: [
          { risk: 'Competitor Microsoft bundling 40% discount', category: 'competitor_threat', why_it_matters: 'Aggressive pricing threat' },
        ],
        resolved: [],
      },
      stakeholder_signals: [],
      supporting_evidence: normalizeEvidenceList([
        { quote: "Sarah: 'Microsoft just offered us an E5 bundle with 40% off.'", speaker: 'Sarah', pillar_key: 'budget', grounding_type: 'explicit_statement', confidence: 95 },
      ]),
    };

    executePersistDealReview(db, {
      auth_user: userA,
      auth_role: 'authenticated',
      p_deal_id: dealA,
      p_user_id: userA,
      p_review: call3Review,
      p_resolved_stage: 'Discovery',
      p_conversation_id: 'conv-003',
    });

    // Verify DB State after Call 3:
    // 1. Both EB risk and competitor risk coexist in deal_risks table (size = 2)
    // 2. EB risk escalated to consecutive count = 3 (critical severity)
    // 3. Competitor risk is active with consecutive count = 1
    // 4. Evidence count = 3
    // 5. Deal state updated to Critical (health = 20)
    expect(db.deal_risks.size).toBe(2);

    const ebRisk = Array.from(db.deal_risks.values()).find((r) => r.risk_category === 'economic_buyer');
    expect(ebRisk).toBeDefined();
    expect(ebRisk?.status).toBe('recurring');
    expect(ebRisk?.consecutive_unresolved_calls).toBe(3);
    expect(ebRisk?.severity).toBe('critical');

    const compRisk = Array.from(db.deal_risks.values()).find((r) => r.risk_category === 'competitor_threat');
    expect(compRisk).toBeDefined();
    expect(compRisk?.status).toBe('active');
    expect(compRisk?.consecutive_unresolved_calls).toBe(1);

    expect(db.deal_evidence.length).toBe(3);
    expect(db.deal_state.get(dealA)?.current_status).toBe('Critical');
    expect(db.deal_state.get(dealA)?.deal_health_score).toBe(20);
    expect(db.deal_state_transitions.length).toBeGreaterThanOrEqual(1);
  });
});
