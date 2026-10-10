-- Migration: 20261010000000_harden_retry_schedule_and_orphan_recovery.sql
-- Description:
--   Hardens retry-call-reviews scheduling and orphan recovery:
--   1. Re-schedules retry-call-reviews-every-minute via pg_cron & pg_net with robust fallback.
--      Checks vault.decrypted_secrets, current_setting, and falls back to SUPABASE_URL / local URL.
--   2. Adds index on conversations (status, retry_after) for fast retry claiming.

CREATE INDEX IF NOT EXISTS idx_conversations_retry_claiming
ON public.conversations (retry_after ASC, created_at ASC)
WHERE status = 'retry_pending';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND
     EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-call-reviews-every-minute') THEN
      PERFORM cron.unschedule('retry-call-reviews-every-minute');
    END IF;

    PERFORM cron.schedule(
      'retry-call-reviews-every-minute',
      '* * * * *',
      $cron_job$
      DO $body$
      DECLARE
        v_base_url text;
        v_service_key text;
        v_job_secret text;
        v_headers jsonb;
      BEGIN
        -- 1. Try to fetch from vault if available
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'vault' AND table_name = 'decrypted_secrets') THEN
          BEGIN
            SELECT decrypted_secret INTO v_service_key
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key'
            LIMIT 1;

            SELECT decrypted_secret INTO v_base_url
            FROM vault.decrypted_secrets
            WHERE name = 'edge_function_base_url'
            LIMIT 1;

            SELECT decrypted_secret INTO v_job_secret
            FROM vault.decrypted_secrets
            WHERE name = 'retry_call_reviews_job_secret'
            LIMIT 1;
          EXCEPTION WHEN OTHERS THEN
            -- Ignore vault read errors
          END;
        END IF;

        -- 2. Fall back to app.settings GUCs
        v_base_url := COALESCE(
          v_base_url,
          current_setting('app.settings.edge_function_base_url', true),
          'http://localhost:54321/functions/v1'
        );

        v_service_key := COALESCE(
          v_service_key,
          current_setting('app.settings.service_role_key', true),
          ''
        );

        v_headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        );

        IF v_job_secret IS NOT NULL AND length(v_job_secret) > 0 THEN
          v_headers := v_headers || jsonb_build_object('x-retry-call-reviews-job-secret', v_job_secret);
        END IF;

        PERFORM net.http_post(
          url := v_base_url || '/retry-call-reviews',
          headers := v_headers,
          body := '{}'::jsonb
        );
      END;
      $body$;
      $cron_job$
    );
  END IF;
END;
$$;
