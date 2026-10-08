-- Migration: 20261008040000_schedule_retry_call_reviews.sql
-- Description: Schedules retry-call-reviews via pg_cron & pg_net when available, safely guarded for local/testing environments.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND
     EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- If already scheduled, unschedule first to be idempotent
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-call-reviews-every-minute') THEN
      PERFORM cron.unschedule('retry-call-reviews-every-minute');
    END IF;

    PERFORM cron.schedule(
      'retry-call-reviews-every-minute',
      '* * * * *',
      $cron_job$
      SELECT net.http_post(
        url := coalesce(current_setting('app.settings.edge_function_base_url', true), 'http://localhost:54321/functions/v1') || '/retry-call-reviews',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
        ),
        body := '{}'::jsonb
      );
      $cron_job$
    );
  END IF;
END;
$$;
