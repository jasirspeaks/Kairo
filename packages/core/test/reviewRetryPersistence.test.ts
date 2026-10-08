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
      DELETE FROM public.conversations;
      DELETE FROM public.deals;
      DELETE FROM auth.users;

      INSERT INTO auth.users (id, email) VALUES ('${userA}', 'user@example.com');

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
});
