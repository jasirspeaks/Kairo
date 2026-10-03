import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {
  DealReview,
  normalizeEvidenceList,
} from '../src';

/**
 * REAL Database Integration Test Suite for Kairo Authoritative Persistence Engine.
 * Exercises genuine PostgreSQL (PGlite engine) with all actual migrations applied,
 * invoking public.persist_deal_review() directly in the database.
 */
describe('TASK 2 — Authoritative PostgreSQL Database Integration Suite', () => {
  let db: PGlite;

  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const dealA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const dealB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeAll(async () => {
    db = new PGlite();

    // Bootstrap base auth, roles, and publications required by Supabase migrations
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS vault;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
      $$;

      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamptz DEFAULT now()
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
      END
      $$;
    `);

    // Apply all migration files in sorted order
    const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Stub hosted extensions that are unnecessary for engine semantics
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pg_cron"[^;]*;/gi, '-- skipped pg_cron');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pg_net"[^;]*;/gi, '-- skipped pg_net');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "supabase_vault"[^;]*;/gi, '-- skipped supabase_vault');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"[^;]*;/gi, '-- skipped pg_stat_statements');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp"[^;]*;/gi, '-- skipped uuid-ossp');
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto"[^;]*;/gi, '-- skipped pgcrypto');

      await db.exec(sql);
    }
  }, 30000);

  beforeEach(async () => {
    // Reset database rows for isolated test execution
    await db.exec(`
      DELETE FROM public.deal_evidence;
      DELETE FROM public.deal_pillar_history;
      DELETE FROM public.deal_state_transitions;
      DELETE FROM public.deal_risks;
      DELETE FROM public.stakeholders;
      DELETE FROM public.deal_state;
      DELETE FROM public.conversations;
      DELETE FROM public.deals;
      DELETE FROM public.subscriptions;
      DELETE FROM auth.users;

      -- Seed test users
      INSERT INTO auth.users (id, email) VALUES
        ('${userA}', 'alice@example.com'),
        ('${userB}', 'bob@example.com');

      -- Seed active subscriptions (write access gate)
      INSERT INTO public.subscriptions (user_id, status, trial_end) VALUES
        ('${userA}', 'active', now() + interval '30 days'),
        ('${userB}', 'active', now() + interval '30 days');

      -- Seed deals
      INSERT INTO public.deals (id, user_id, deal_name, company_name, deal_stage, risk_level) VALUES
        ('${dealA}', '${userA}', 'Acme Cloud Integration', 'Acme Corp', 'Discovery', 'low'),
        ('${dealB}', '${userB}', 'Beta Security Platform', 'Beta Inc', 'Discovery', 'low');
    `);
  });

  async function setSession(userId: string | null, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    if (userId) {
      await db.query(
        `SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`,
        [userId, role]
      );
    } else {
      await db.query(
        `SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', $1, false)`,
        [role]
      );
    }
  }

  it('Executes 3-Call Longitudinal Evolution Scenario with Real PostgreSQL State Validation', async () => {
    // Authenticate as User A
    await setSession(userA, 'authenticated');

    // -------------------------------------------------------------------------
    // CALL 1: Initial review with unconfirmed Economic Buyer and unresolved Decision Process
    // -------------------------------------------------------------------------
    const conv1 = 'c1111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO public.conversations (id, user_id, deal_id, title, input_type, status)
      VALUES ('${conv1}', '${userA}', '${dealA}', 'Discovery Call 1', 'audio', 'complete');
    `);

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
          { gap: 'Decision Process', question_to_answer: 'What is the formal approval timeline?' },
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
        what_youre_missing: [
          { gap: 'Economic Buyer', question_to_answer: 'Who holds budget signoff?' },
        ],
        recommended_next_action: 'Engage EB.',
        manager_note: 'Early discovery.',
        pillars: {
          compelling_event: { status: 'unconfirmed', evidence: 'Not yet validated', confidence: 20 },
          economic_buyer: { status: 'unconfirmed', evidence: 'No CFO access yet', confidence: 30 },
          decision_process: { status: 'partial', evidence: 'Process undefined', confidence: 40 },
          budget: { status: 'unconfirmed', evidence: 'Budget unspecified', confidence: 20 },
          champion: { status: 'confirmed', evidence: 'Sarah is strong advocate', confidence: 85 },
        },
      },
      stakeholder_signals: [
        { name: 'Sarah', role: 'Team Lead', sentiment: 'champion', evidence: 'Enthusiastic advocate.' },
      ],
      supporting_evidence: normalizeEvidenceList([
        {
          quote: "Sarah: 'I love it, but I don't have budget signing authority.'",
          speaker: 'Sarah',
          pillar_key: 'economic_buyer',
          grounding_type: 'explicit_statement',
          confidence: 95,
        },
      ]),
    };

    // Execute the REAL PostgreSQL persistence path
    await db.query(
      `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid)`,
      [dealA, userA, JSON.stringify(call1Review), 'Discovery', conv1]
    );

    // Query REAL PostgreSQL tables to verify persisted state
    const dealRow1 = (await db.query(`SELECT * FROM public.deals WHERE id = $1`, [dealA])).rows[0] as any;
    expect(dealRow1.deal_stage).toBe('Discovery');
    expect(dealRow1.risk_level).toBe('high');
    expect(dealRow1.champion).toBe('Sarah');

    const stateRow1 = (await db.query(`SELECT * FROM public.deal_state WHERE deal_id = $1`, [dealA])).rows[0] as any;
    expect(stateRow1.user_id).toBe(userA);
    expect(stateRow1.current_status).toBe('At Risk');
    expect(stateRow1.deal_health_score).toBe(42);
    expect(stateRow1.highest_priority_risk).toBe('Economic Buyer CFO unengaged');

    const risks1 = (await db.query(`SELECT * FROM public.deal_risks WHERE deal_id = $1`, [dealA])).rows as any[];
    expect(risks1.length).toBe(1);
    expect(risks1[0].title).toBe('Economic Buyer CFO unengaged');
    expect(risks1[0].status).toBe('active');
    expect(risks1[0].consecutive_unresolved_calls).toBe(1);
    expect(risks1[0].fingerprint).toBe('economic_buyer:economic_buyer_cfo_unengaged');
    expect(risks1[0].risk_category).toBe('economic_buyer');

    const evidence1 = (await db.query(`SELECT * FROM public.deal_evidence WHERE deal_id = $1`, [dealA])).rows as any[];
    expect(evidence1.length).toBe(1);
    expect(evidence1[0].quote).toContain("don't have budget signing authority");
    expect(evidence1[0].pillar_key).toBe('economic_buyer');

    const stakeholders1 = (await db.query(`SELECT * FROM public.stakeholders WHERE deal_id = $1`, [dealA])).rows as any[];
    expect(stakeholders1.length).toBe(1);
    expect(stakeholders1[0].name).toBe('Sarah');
    expect(stakeholders1[0].sentiment).toBe('champion');

    // -------------------------------------------------------------------------
    // CALL 2: Second call on same deal where EB remains uncontacted
    // -------------------------------------------------------------------------
    const conv2 = 'c2222222-2222-4222-8222-222222222222';
    await db.exec(`
      INSERT INTO public.conversations (id, user_id, deal_id, title, input_type, status)
      VALUES ('${conv2}', '${userA}', '${dealA}', 'Discovery Call 2', 'audio', 'complete');
    `);

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
        {
          quote: "Sarah: 'Finance has not gotten back to me yet.'",
          speaker: 'Sarah',
          pillar_key: 'economic_buyer',
          grounding_type: 'explicit_statement',
          confidence: 90,
        },
      ]),
    };

    // Execute the REAL persistence path again
    await db.query(
      `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid)`,
      [dealA, userA, JSON.stringify(call2Review), 'Discovery', conv2]
    );

    // Verify DB State after Call 2
    const risks2 = (await db.query(`SELECT * FROM public.deal_risks WHERE deal_id = $1 ORDER BY created_at ASC`, [dealA])).rows as any[];
    // Verify duplicate risk was NOT created: exactly 1 risk record exists
    expect(risks2.length).toBe(1);
    expect(risks2[0].title).toBe('Economic Buyer CFO unengaged');
    expect(risks2[0].status).toBe('recurring');
    expect(risks2[0].consecutive_unresolved_calls).toBe(2);
    expect(risks2[0].severity).toBe('high');

    // Verify evidence accumulated
    const evidence2 = (await db.query(`SELECT * FROM public.deal_evidence WHERE deal_id = $1 ORDER BY created_at ASC`, [dealA])).rows as any[];
    expect(evidence2.length).toBe(2);
    expect(evidence2[0].quote).toContain("don't have budget signing authority");
    expect(evidence2[1].quote).toContain('Finance has not gotten back to me yet');

    // -------------------------------------------------------------------------
    // CALL 3: Third call where EB risk persists AND Competitor threat appears
    // -------------------------------------------------------------------------
    const conv3 = 'c3333333-3333-4333-8333-333333333333';
    await db.exec(`
      INSERT INTO public.conversations (id, user_id, deal_id, title, input_type, status)
      VALUES ('${conv3}', '${userA}', '${dealA}', 'Discovery Call 3', 'audio', 'complete');
    `);

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
        {
          quote: "Sarah: 'Microsoft just offered us an E5 bundle with 40% off.'",
          speaker: 'Sarah',
          pillar_key: 'budget',
          grounding_type: 'explicit_statement',
          confidence: 95,
        },
      ]),
    };

    // Execute the REAL persistence path
    await db.query(
      `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid)`,
      [dealA, userA, JSON.stringify(call3Review), 'Discovery', conv3]
    );

    // Verify DB State after Call 3:
    // 1. Both EB risk and competitor risk exist simultaneously
    const risks3 = (await db.query(`SELECT * FROM public.deal_risks WHERE deal_id = $1 ORDER BY created_at ASC`, [dealA])).rows as any[];
    expect(risks3.length).toBe(2);

    const ebRisk = risks3.find((r) => r.risk_category === 'economic_buyer');
    expect(ebRisk).toBeDefined();
    expect(ebRisk.status).toBe('recurring');
    expect(ebRisk.consecutive_unresolved_calls).toBe(3);
    expect(ebRisk.severity).toBe('critical'); // Escalated to critical on call 3

    const compRisk = risks3.find((r) => r.risk_category === 'competitor_threat');
    expect(compRisk).toBeDefined();
    expect(compRisk.status).toBe('active');
    expect(compRisk.consecutive_unresolved_calls).toBe(1);

    // 2. Risk fingerprints are distinct
    expect(ebRisk.fingerprint).not.toBe(compRisk.fingerprint);
    expect(ebRisk.fingerprint).toBe('economic_buyer:economic_buyer_cfo_unengaged');
    expect(compRisk.fingerprint).toBe('competitor_threat:competitor_microsoft_bundling_40');

    // 3. Evidence history intact across all 3 calls
    const evidence3 = (await db.query(`SELECT * FROM public.deal_evidence WHERE deal_id = $1 ORDER BY created_at ASC`, [dealA])).rows as any[];
    expect(evidence3.length).toBe(3);
    expect(evidence3[0].quote).toContain("don't have budget signing authority");
    expect(evidence3[1].quote).toContain('Finance has not gotten back to me yet');
    expect(evidence3[2].quote).toContain('Microsoft just offered us an E5 bundle');

    // 4. Deal state updated
    const state3 = (await db.query(`SELECT * FROM public.deal_state WHERE deal_id = $1`, [dealA])).rows[0] as any;
    expect(state3.current_status).toBe('Critical');
    expect(state3.deal_health_score).toBe(20);

    // 5. State transitions tracked in database
    const transitions = (await db.query(`SELECT * FROM public.deal_state_transitions WHERE deal_id = $1`, [dealA])).rows as any[];
    expect(transitions.length).toBeGreaterThanOrEqual(1);
  });

  describe('Security Matrix & IDOR Authorization Verification', () => {
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

    it('A + DEAL A (authorized owner) -> SUCCEEDS', async () => {
      await setSession(userA, 'authenticated');
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, NULL)`,
          [dealA, userA, JSON.stringify(sampleReview), 'Discovery']
        )
      ).resolves.toBeDefined();
    });

    it('A + DEAL B (target deal owned by B, p_user_id=A) -> FAILS', async () => {
      await setSession(userA, 'authenticated');
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, NULL)`,
          [dealB, userA, JSON.stringify(sampleReview), 'Discovery']
        )
      ).rejects.toThrow(/Deal not found or unauthorized/);
    });

    it('A + user_id=B + DEAL B (spoofed p_user_id) -> FAILS with identity mismatch', async () => {
      await setSession(userA, 'authenticated');
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, NULL)`,
          [dealB, userB, JSON.stringify(sampleReview), 'Discovery']
        )
      ).rejects.toThrow(/Unauthorized: user ID mismatch/);
    });

    it('B + DEAL A (User B accessing Deal A) -> FAILS', async () => {
      await setSession(userB, 'authenticated');
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, NULL)`,
          [dealA, userB, JSON.stringify(sampleReview), 'Discovery']
        )
      ).rejects.toThrow(/Deal not found or unauthorized/);
    });

    it('Anonymous caller -> FAILS with authenticated caller required', async () => {
      await setSession(null, 'anon');
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, NULL)`,
          [dealA, userA, JSON.stringify(sampleReview), 'Discovery']
        )
      ).rejects.toThrow(/Unauthorized: authenticated caller required/);
    });
  });

  describe('Concurrency & Row Locking (FOR UPDATE) Verification', () => {
    it('Verifies SQL definition acquires exclusive lock FOR UPDATE on deals row before state-dependent logic', async () => {
      // Query PostgreSQL system catalogs for the function source code
      const funcRes = await db.query(`
        SELECT prosrc
        FROM pg_proc
        WHERE proname = 'persist_deal_review';
      `);

      expect(funcRes.rows.length).toBeGreaterThan(0);
      const funcBody = (funcRes.rows[0] as any).prosrc;

      // 1. FOR UPDATE row lock must be explicitly performed on public.deals
      expect(funcBody).toContain('FOR UPDATE');
      expect(funcBody).toMatch(/FROM public\.deals[\s\S]*?FOR UPDATE;/i);

      // 2. Strict auth.uid() check must precede any state mutations
      const authIdx = funcBody.indexOf('auth.uid()');
      const lockIdx = funcBody.indexOf('FOR UPDATE');
      const insertIdx = funcBody.indexOf('INSERT INTO public.deal_state');

      expect(authIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeGreaterThan(authIdx);
      expect(insertIdx).toBeGreaterThan(lockIdx);
    });
  });
});
