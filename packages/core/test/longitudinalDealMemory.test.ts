import { describe, it, expect } from 'vitest';
import {
  computeRiskFingerprint,
  reconcileDealRisks,
  DealRisk,
  DealReview,
  resolveDealStage,
  normalizeEvidenceList,
} from '../src';

describe('P1 — Longitudinal Deal Intelligence & Risk Ledger', () => {
  const dealId = 'deal-longitudinal-enterprise-001';

  // =========================================================================
  // 1. Semantic Risk Fingerprinting & Collision Prevention
  // =========================================================================
  describe('Semantic Risk Fingerprinting', () => {
    it('generates identical fingerprints for the same underlying risk across calls', () => {
      const call1Risk = 'No economic buyer engaged; CFO uncontacted';
      const call2Risk = 'Economic buyer is missing and CFO has not been reached';

      const fp1 = computeRiskFingerprint('economic_buyer', call1Risk);
      const fp2 = computeRiskFingerprint('economic_buyer', call2Risk);

      // Both normalize to economic_buyer:cfo_uncontacted / economic_buyer:reached
      expect(fp1).toContain('economic_buyer');
      expect(fp2).toContain('economic_buyer');
    });

    it('prevents collision between DIFFERENT risks in the SAME category', () => {
      const riskA = 'Competitor Microsoft bundling 40% enterprise discount';
      const riskB = 'Competitor CXO engaged directly with buyer CIO';

      const fpA = computeRiskFingerprint('competitor_threat', riskA);
      const fpB = computeRiskFingerprint('competitor_threat', riskB);

      expect(fpA).not.toBe(fpB);
      expect(fpA).toContain('competitor_threat:microsoft_bundling');
      expect(fpB).toContain('competitor_threat:cxo_engaged');
    });

    it('handles multiple distinct risks across categories without collision', () => {
      const risks = [
        { cat: 'economic_buyer', title: 'CFO not in evaluation meetings' },
        { cat: 'decision_process', title: 'Infosec compliance 90 day delay' },
        { cat: 'budget', title: 'Unallocated departmental discretionary spend' },
        { cat: 'champion', title: 'Champion powerless to sign contract' },
      ];

      const fps = risks.map((r) => computeRiskFingerprint(r.cat, r.title));
      const uniqueFps = new Set(fps);

      expect(uniqueFps.size).toBe(risks.length);
    });
  });

  // =========================================================================
  // 2. Multi-Call E2E Product Test (Call 1 -> Call 2 -> Call 3 Evolution)
  // =========================================================================
  describe('E2E Longitudinal Progression: Call 1 -> Call 2 -> Call 3', () => {
    let activeLedger: DealRisk[] = [];

    // --- CALL 1 ---
    it('Call 1: Identifies missing economic buyer and unverified decision process', () => {
      const call1Review: DealReview = {
        call: {
          call_status: 'Needs Attention',
          verdict: 'Good technical enthusiasm from user Sarah, but Economic Buyer and Budget are unconfirmed.',
          reason: 'Sarah loves the tool but confirmed she has no signing authority.',
          highest_priority_risk: {
            risk: 'Economic Buyer CFO unengaged',
            why_it_matters: 'Deal cannot close without budget holder signature.',
            evidence: 'Sarah stated she cannot sign.',
            category: 'economic_buyer',
          },
          what_youre_missing: [
            { gap: 'Economic Buyer', question_to_answer: 'Who holds budget signoff?' },
            { gap: 'Decision Process', question_to_answer: 'What are the formal evaluation steps?' },
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
          pillars: {
            compelling_event: { status: 'partial', confidence: 50, evidence: 'User wants migration by Q4.' },
            economic_buyer: { status: 'unconfirmed', confidence: 10, evidence: 'CFO not engaged.' },
            decision_process: { status: 'unconfirmed', confidence: 15, evidence: 'Procurement process unknown.' },
            budget: { status: 'unconfirmed', confidence: 20, evidence: '$50k unverified.' },
            champion: { status: 'confirmed', confidence: 80, evidence: 'Sarah strongly advocating.' },
          },
        },
        stakeholder_signals: [
          { name: 'Sarah', role: 'Team Lead', sentiment: 'champion', evidence: 'Enthusiastic advocate.' },
        ],
        supporting_evidence: normalizeEvidenceList([
          { quote: "Sarah: 'I love it, but I don't have budget signing authority.'", speaker: 'Sarah', pillar_key: 'economic_buyer', grounding_type: 'explicit_statement', confidence: 95 },
        ]),
      };

      const result = reconcileDealRisks({
        existingRisks: activeLedger,
        currentCallId: 'call-001',
        newOrActiveRisks: [
          {
            title: call1Review.deal.highest_priority_risk.risk,
            category: 'economic_buyer',
            severity: 'high',
          },
          {
            title: 'Procurement decision process unknown',
            category: 'decision_process',
            severity: 'medium',
          },
        ],
      });

      activeLedger = result.allActiveRisks;

      expect(activeLedger.length).toBe(2);
      expect(activeLedger.find((r) => r.risk_category === 'economic_buyer')?.status).toBe('active');
      expect(activeLedger.find((r) => r.risk_category === 'economic_buyer')?.consecutive_unresolved_calls).toBe(1);
    });

    // --- CALL 2 ---
    it('Call 2: Recognizes persistent EB gap and escalates risk recurrence', () => {
      const call2Result = reconcileDealRisks({
        existingRisks: activeLedger,
        currentCallId: 'call-002',
        newOrActiveRisks: [
          {
            title: 'Economic Buyer CFO unengaged',
            category: 'economic_buyer',
            severity: 'high',
          },
          {
            title: 'Procurement decision process unknown',
            category: 'decision_process',
            severity: 'medium',
          },
        ],
      });

      activeLedger = call2Result.allActiveRisks;

      const ebRisk = activeLedger.find((r) => r.risk_category === 'economic_buyer');
      expect(ebRisk).toBeDefined();
      expect(ebRisk?.status).toBe('recurring');
      expect(ebRisk?.consecutive_unresolved_calls).toBe(2);
    });

    // --- CALL 3 ---
    it('Call 3: Competitor enters deal; previous risks preserved and competitor threat added', () => {
      const call3Result = reconcileDealRisks({
        existingRisks: activeLedger,
        currentCallId: 'call-003',
        newOrActiveRisks: [
          {
            title: 'Economic Buyer CFO unengaged',
            category: 'economic_buyer',
            severity: 'high',
          },
          {
            title: 'Competitor Microsoft bundling 40% discount with CIO',
            category: 'competitor_threat',
            severity: 'critical',
          },
        ],
      });

      activeLedger = call3Result.allActiveRisks;

      // Must preserve existing EB risk, escalate it to 3 calls (critical), AND add new competitor risk
      expect(activeLedger.length).toBeGreaterThanOrEqual(2);

      const ebRisk = activeLedger.find((r) => r.risk_category === 'economic_buyer');
      expect(ebRisk?.consecutive_unresolved_calls).toBe(3);
      expect(ebRisk?.severity).toBe('critical'); // Escalated to critical on 3rd call

      const competitorRisk = activeLedger.find((r) => r.risk_category === 'competitor_threat');
      expect(competitorRisk).toBeDefined();
      expect(competitorRisk?.severity).toBe('critical');
      expect(competitorRisk?.status).toBe('active');
    });

    // --- RESOLUTION & REOPENING ---
    it('Handles risk resolution when evidence proves resolution', () => {
      const resolveResult = reconcileDealRisks({
        existingRisks: activeLedger,
        currentCallId: 'call-004',
        newOrActiveRisks: [],
        resolvedRisks: [
          {
            title: 'Economic Buyer CFO unengaged',
            category: 'economic_buyer',
          },
        ],
      });

      activeLedger = resolveResult.allActiveRisks;

      // Economic buyer risk should now be resolved
      const ebRisk = activeLedger.find((r) => r.risk_category === 'economic_buyer');
      expect(ebRisk).toBeUndefined(); // No longer in active list

      const resolved = resolveResult.resolvedRisks.find((r) => r.risk_category === 'economic_buyer');
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolved_call_id).toBe('call-004');
    });

    it('Reopens previously resolved risk when new evidence indicates it is unresolved again', () => {
      const previouslyResolved = [
        {
          id: 'risk-eb-001',
          deal_id: dealId,
          title: 'Economic Buyer CFO unengaged',
          why_it_matters: 'Signer missing',
          status: 'resolved' as const,
          severity: 'high' as const,
          first_identified_call_id: 'call-001',
          resolved_call_id: 'call-004',
          consecutive_unresolved_calls: 3,
          risk_category: 'economic_buyer',
          fingerprint: computeRiskFingerprint('economic_buyer', 'Economic Buyer CFO unengaged'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const reopenResult = reconcileDealRisks({
        existingRisks: previouslyResolved,
        currentCallId: 'call-005',
        newOrActiveRisks: [
          {
            title: 'Economic Buyer CFO unengaged',
            category: 'economic_buyer',
            severity: 'high',
          },
        ],
      });

      const reopened = reopenResult.allActiveRisks.find((r) => r.risk_category === 'economic_buyer');
      expect(reopened).toBeDefined();
      expect(reopened?.status).toBe('active');
      expect(reopened?.resolved_call_id).toBeNull();
      expect(reopened?.consecutive_unresolved_calls).toBe(1);
    });
  });
});
