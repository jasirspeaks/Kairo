import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Durable Processing Leases & Stale Recovery Database Suite', () => {
  let db: PGlite;

  const userA = '11111111-1111-4111-8111-111111111111';
  const dealA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const convA = '33333333-3333-4333-8333-333333333333';

  async function setSession(userId: string | null, role = 'authenticated') {
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

  beforeAll(async () => {
    db = new PGlite();

    // Bootstrap base auth & roles
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
    await db.exec(`
      DELETE FROM public.subscriptions;
      DELETE FROM public.conversations;
      DELETE FROM public.deals;
      DELETE FROM auth.users;

      INSERT INTO auth.users (id, email) VALUES ('${userA}', 'user@example.com');
      INSERT INTO public.subscriptions (user_id, status, trial_end) VALUES ('${userA}', 'active', now() + interval '30 days');

      INSERT INTO public.deals (id, user_id, deal_name, company_name, deal_stage, status)
      VALUES ('${dealA}', '${userA}', 'Acme Deal', 'Acme Corp', 'Discovery', 'active');
    `);
  });

  it('stamps processing_lease_until, processing_token, and last_retry_at on claim_conversation_review', async () => {
    // 1. Insert conversation in pending state
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'pending', 'Sample transcript with sufficient length for review testing...');
    `);

    // 2. Claim conversation as authenticated user
    await setSession(userA, 'authenticated');
    const claimRes = await db.query(
      `SELECT public.claim_conversation_review($1::uuid, $2::uuid, false) AS claimed;`,
      [convA, userA]
    );

    expect((claimRes.rows[0] as any).claimed).toBe(true);

    // 3. Inspect updated row state
    const convRow = await db.query(
      `SELECT status, processing_lease_until, processing_token, last_retry_at, retry_attempts, retry_after, last_error
       FROM public.conversations WHERE id = $1;`,
      [convA]
    );

    const row = convRow.rows[0] as any;
    expect(row.status).toBe('processing');
    expect(row.processing_lease_until).not.toBeNull();
    expect(row.processing_token).not.toBeNull();
    expect(row.last_retry_at).not.toBeNull();
    expect(row.retry_after).toBeNull();
    expect(row.last_error).toBeNull();

    // Verify lease is set in the future (between 4 and 6 minutes from now)
    const leaseTime = new Date(row.processing_lease_until).getTime();
    const now = Date.now();
    expect(leaseTime - now).toBeGreaterThan(4 * 60 * 1000);
    expect(leaseTime - now).toBeLessThanOrEqual(5.1 * 60 * 1000);
  });

  it('prevents concurrent claim while processing lease is active', async () => {
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, processing_lease_until)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample transcript...', now() + interval '4 minutes');
    `);

    await setSession(userA, 'authenticated');
    const secondClaim = await db.query(
      `SELECT public.claim_conversation_review($1::uuid, $2::uuid, false) AS claimed;`,
      [convA, userA]
    );

    expect((secondClaim.rows[0] as any).claimed).toBe(false);
  });

  it('permits reclaiming an existing conversation if its processing lease has expired', async () => {
    // Conversation left in processing with expired lease
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, processing_lease_until)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample transcript...', now() - interval '1 minute');
    `);

    await setSession(userA, 'authenticated');
    const reclaim = await db.query(
      `SELECT public.claim_conversation_review($1::uuid, $2::uuid, false) AS claimed;`,
      [convA, userA]
    );

    expect((reclaim.rows[0] as any).claimed).toBe(true);

    const convRow = await db.query(
      `SELECT status, processing_lease_until FROM public.conversations WHERE id = $1;`,
      [convA]
    );
    const row = convRow.rows[0] as any;
    expect(row.status).toBe('processing');
    const newLease = new Date(row.processing_lease_until).getTime();
    expect(newLease).toBeGreaterThan(Date.now());
  });

  it('RECOVERS EXACT PRODUCTION STUCK ROW: processing with last_retry_at=NULL and retry_attempts=0', async () => {
    // This is the exact state reported from production:
    // status: processing, retry_attempts: 0, retry_after: NULL, last_retry_at: NULL, last_error: NULL, updated_at > 5m ago
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, retry_attempts, retry_after, last_retry_at, last_error, updated_at)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample transcript...', 0, NULL, NULL, NULL, now() - interval '15 minutes');
    `);

    // Call claim_call_review_retry as service_role
    await setSession(null, 'service_role');
    const claimResult = await db.query(
      `SELECT * FROM public.claim_call_review_retry(7, 1);`
    );

    // It must claim this previously unrecoverable job!
    expect(claimResult.rows.length).toBe(1);
    const claimedJob = claimResult.rows[0] as any;
    expect(claimedJob.id).toBe(convA);
    expect(claimedJob.retry_attempts).toBe(1);

    // Verify row state in DB is now processing with active lease
    const convRow = await db.query(
      `SELECT status, retry_attempts, last_retry_at, processing_lease_until FROM public.conversations WHERE id = $1;`,
      [convA]
    );
    const row = convRow.rows[0] as any;
    expect(row.status).toBe('processing');
    expect(row.retry_attempts).toBe(1);
    expect(row.last_retry_at).not.toBeNull();
    expect(row.processing_lease_until).not.toBeNull();
  });

  it('recovers orphaned pending rows older than 2 minutes into retry_pending and claims them', async () => {
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, created_at)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'pending', 'Valid transcript...', now() - interval '3 minutes');
    `);

    await setSession(null, 'service_role');
    const claimResult = await db.query(
      `SELECT * FROM public.claim_call_review_retry(7, 1);`
    );

    expect(claimResult.rows.length).toBe(1);
    expect((claimResult.rows[0] as any).id).toBe(convA);
    expect((claimResult.rows[0] as any).retry_attempts).toBe(1);
  });

  it('marks expired processing jobs as failed once max retry attempts are reached', async () => {
    await db.exec(`
      INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, retry_attempts, processing_lease_until)
      VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Valid transcript...', 7, now() - interval '1 minute');
    `);

    await setSession(null, 'service_role');
    const claimResult = await db.query(
      `SELECT * FROM public.claim_call_review_retry(7, 1);`
    );

    expect(claimResult.rows.length).toBe(0);

    const convRow = await db.query(
      `SELECT status, retry_after FROM public.conversations WHERE id = $1;`,
      [convA]
    );
    const row = convRow.rows[0] as any;
    expect(row.status).toBe('failed');
    expect(row.retry_after).toBeNull();
  });

  describe('Phase 2 Database Invariants & Atomic Output Commit', () => {
    it('enforces check constraint on valid conversation statuses', async () => {
      await expect(
        db.exec(`
          INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript)
          VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'invalid_status', 'Some text...');
        `)
      ).rejects.toThrow(/conversations_status_check/);
    });

    it('enforces retry_pending invariant requiring retry_after timestamp', async () => {
      await expect(
        db.exec(`
          INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, retry_after)
          VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'retry_pending', 'Some text...', NULL);
        `)
      ).rejects.toThrow(/conversations_retry_pending_invariant/);
    });

    it('claim_conversation_review accepts and binds worker-assigned processing token', async () => {
      await db.exec(`
        INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript)
        VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'pending', 'Sample text...');
      `);

      const workerToken = '99999999-9999-4999-8999-999999999999';
      await setSession(userA, 'authenticated');
      const claimRes = await db.query(
        `SELECT public.claim_conversation_review($1::uuid, $2::uuid, false, $3::uuid) AS claimed;`,
        [convA, userA, workerToken]
      );

      expect((claimRes.rows[0] as any).claimed).toBe(true);

      const convRow = await db.query(
        `SELECT status, processing_token, processing_lease_until FROM public.conversations WHERE id = $1;`,
        [convA]
      );
      const row = convRow.rows[0] as any;
      expect(row.status).toBe('processing');
      expect(row.processing_token).toBe(workerToken);
      expect(row.processing_lease_until).not.toBeNull();
    });

    it('claim_call_review_retry returns processing_token and lease_until to retry worker', async () => {
      await db.exec(`
        INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, retry_after, retry_attempts)
        VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'retry_pending', 'Sample text...', now() - interval '1 minute', 1);
      `);

      await setSession(null, 'service_role');
      const claimResult = await db.query(
        `SELECT * FROM public.claim_call_review_retry(7, 1);`
      );

      expect(claimResult.rows.length).toBe(1);
      const job = claimResult.rows[0] as any;
      expect(job.id).toBe(convA);
      expect(job.processing_token).not.toBeNull();
      expect(job.processing_lease_until).not.toBeNull();
    });

    it('persist_deal_review atomically commits deal state AND completes conversation under matching token', async () => {
      const workerToken = '88888888-8888-4888-8888-888888888888';
      await db.exec(`
        INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, processing_token, processing_lease_until)
        VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample text...', '${workerToken}', now() + interval '5 minutes');
      `);

      const sampleReview = {
        call: {
          call_status: 'On Track',
          verdict: 'Excellent discovery meeting',
          reason: 'EB confirmed',
          highest_priority_risk: { risk: 'Minor timeline gap', why_it_matters: 'Date', evidence: 'Q3 target', category: 'timeline' },
          what_youre_missing: [],
          recommended_next_action: 'Send proposal',
          key_follow_up_message: 'Thanks',
          manager_note: 'Progressing nicely',
        },
        deal: {
          status: 'Healthy',
          confidence: 'High',
          health_score: 85,
          highest_priority_risk: { risk: 'Minor timeline gap', why_it_matters: 'Date', evidence: 'Q3 target', category: 'timeline' },
          what_youre_missing: [],
          status_reason: 'Healthy alignment',
          recommended_next_action: 'Send proposal',
          manager_note: 'Progressing nicely',
        },
        stakeholder_signals: [],
        supporting_evidence: [],
      };

      await setSession(userA, 'authenticated');
      // Execute atomic commit RPC passing matching token
      await db.query(
        `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid, $6::uuid);`,
        [dealA, userA, JSON.stringify(sampleReview), 'Discovery', convA, workerToken]
      );

      // Verify conversation row was atomically completed
      const convRow = await db.query(
        `SELECT status, analysis_json, processing_token, processing_lease_until FROM public.conversations WHERE id = $1;`,
        [convA]
      );
      const row = convRow.rows[0] as any;
      expect(row.status).toBe('complete');
      expect(row.analysis_json).not.toBeNull();
      expect(row.processing_token).toBeNull();
      expect(row.processing_lease_until).toBeNull();

      // Verify deal row was updated
      const dealRow = await db.query(
        `SELECT deal_stage, risk_level FROM public.deals WHERE id = $1;`,
        [dealA]
      );
      expect((dealRow.rows[0] as any).deal_stage).toBe('Discovery');
      expect((dealRow.rows[0] as any).risk_level).toBe('low');
    });

    it('persist_deal_review rejects stale worker with mismatched processing token (zero writes)', async () => {
      const activeWorkerToken = '77777777-7777-4777-7777-777777777777';
      const staleWorkerToken = '66666666-6666-4666-6666-666666666666';

      await db.exec(`
        INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, processing_token, processing_lease_until)
        VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample text...', '${activeWorkerToken}', now() + interval '5 minutes');
      `);

      const sampleReview = {
        call: {
          call_status: 'On Track',
          verdict: 'Stale attempt',
          reason: 'None',
          highest_priority_risk: { risk: 'Risk', why_it_matters: 'Why', evidence: 'Ev', category: 'cat' },
          what_youre_missing: [],
          recommended_next_action: 'None',
          key_follow_up_message: 'None',
          manager_note: 'None',
        },
        deal: {
          status: 'Healthy',
          confidence: 'High',
          health_score: 80,
          highest_priority_risk: { risk: 'Risk', why_it_matters: 'Why', evidence: 'Ev', category: 'cat' },
          what_youre_missing: [],
          status_reason: 'None',
          recommended_next_action: 'None',
          manager_note: 'None',
        },
      };

      await setSession(userA, 'authenticated');

      // Stale worker attempts write with expired token
      await expect(
        db.query(
          `SELECT public.persist_deal_review($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid, $6::uuid);`,
          [dealA, userA, JSON.stringify(sampleReview), 'Discovery', convA, staleWorkerToken]
        )
      ).rejects.toThrow(/Stale worker lease: processing token mismatch/);

      // Verify conversation remains in processing with active worker's token intact
      const convRow = await db.query(
        `SELECT status, analysis_json, processing_token FROM public.conversations WHERE id = $1;`,
        [convA]
      );
      const row = convRow.rows[0] as any;
      expect(row.status).toBe('processing');
      expect(row.analysis_json).toBeNull();
      expect(row.processing_token).toBe(activeWorkerToken);
    });

    it('fail_or_retry_conversation_review rejects stale worker error transition', async () => {
      const activeWorkerToken = '55555555-5555-4555-5555-555555555555';
      const staleWorkerToken = '44444444-4444-4444-4444-444444444444';

      await db.exec(`
        INSERT INTO public.conversations (id, deal_id, user_id, input_type, status, transcript, processing_token, processing_lease_until)
        VALUES ('${convA}', '${dealA}', '${userA}', 'transcript', 'processing', 'Sample text...', '${activeWorkerToken}', now() + interval '5 minutes');
      `);

      await setSession(userA, 'authenticated');

      // Stale worker tries to report retry failure
      const result = await db.query(
        `SELECT public.fail_or_retry_conversation_review($1::uuid, $2::uuid, $3::uuid, 'Stale failure', now() + interval '5 minutes') AS updated;`,
        [convA, userA, staleWorkerToken]
      );

      // Must return false because token did not match!
      expect((result.rows[0] as any).updated).toBe(false);

      // Status must STILL be processing under active worker
      const convRow = await db.query(
        `SELECT status, processing_token FROM public.conversations WHERE id = $1;`,
        [convA]
      );
      expect((convRow.rows[0] as any).status).toBe('processing');
      expect((convRow.rows[0] as any).processing_token).toBe(activeWorkerToken);
    });
  });
});
