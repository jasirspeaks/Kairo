-- Clean, durable retry state for mobile/audio call reviews.
--
-- Active state machine:
--
--   pending/processing
--          |
--          v
--   retry_pending
--          |
--          v
--      processing
--       /       \
--      v         v
--   complete   retry_pending
--                 |
--                 v
--               failed
--
-- The older review_* retry columns are migrated when present and then removed.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS retry_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

DO $$
DECLARE
  legacy_exists boolean;
BEGIN
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'review_retryable'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'review_attempt_count'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'review_next_attempt_at'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'review_claimed_at'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'review_last_error'
    )
  INTO legacy_exists;

  IF legacy_exists THEN
    EXECUTE $sql$
      UPDATE public.conversations
      SET
        retry_attempts = COALESCE(review_attempt_count, 0),
        retry_after = review_next_attempt_at,
        last_retry_at = review_claimed_at,
        last_error = review_last_error,
        status = CASE
          WHEN COALESCE(review_retryable, false)
               AND status <> 'complete'
            THEN 'retry_pending'
          ELSE status
        END
      WHERE
        COALESCE(review_retryable, false)
        OR COALESCE(review_attempt_count, 0) > 0
        OR review_next_attempt_at IS NOT NULL
        OR review_claimed_at IS NOT NULL
        OR review_last_error IS NOT NULL;
    $sql$;
  END IF;
END $$;

ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS review_attempt_count,
  DROP COLUMN IF EXISTS review_next_attempt_at,
  DROP COLUMN IF EXISTS review_claimed_at,
  DROP COLUMN IF EXISTS review_last_error,
  DROP COLUMN IF EXISTS review_retryable;

CREATE INDEX IF NOT EXISTS conversations_retry_queue_idx
  ON public.conversations (retry_after, created_at)
  WHERE status = 'retry_pending'
    AND retry_after IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_call_review_retry(
  p_max_attempts integer DEFAULT 7,
  p_batch_size integer DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  retry_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recover jobs that were claimed by a worker which crashed or timed out.
  -- Only rows with last_retry_at set are eligible, so ordinary user-triggered
  -- processing rows are not touched.
  UPDATE public.conversations
  SET
    status = 'retry_pending',
    retry_after = now(),
    updated_at = now()
  WHERE status = 'processing'
    AND last_retry_at IS NOT NULL
    AND last_retry_at < now() - interval '10 minutes'
    AND retry_attempts < p_max_attempts
    AND deal_id IS NOT NULL
    AND (
      transcript IS NOT NULL
      OR audio_deleted_at IS NULL
    );

  -- Anything that has exhausted its automatic attempts becomes terminally
  -- failed instead of remaining permanently stuck in processing.
  UPDATE public.conversations
  SET
    status = 'failed',
    retry_after = NULL,
    updated_at = now()
  WHERE status = 'processing'
    AND last_retry_at IS NOT NULL
    AND last_retry_at < now() - interval '10 minutes'
    AND retry_attempts >= p_max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT c.id
    FROM public.conversations c
    WHERE c.status = 'retry_pending'
      AND c.retry_after IS NOT NULL
      AND c.retry_after <= now()
      AND c.retry_attempts < p_max_attempts
      AND c.deal_id IS NOT NULL
      AND (
        c.transcript IS NOT NULL
        OR c.audio_deleted_at IS NULL
      )
    ORDER BY
      c.retry_after ASC,
      c.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_batch_size, 1)
  ),
  claimed AS (
    UPDATE public.conversations c
    SET
      status = 'processing',
      retry_attempts = c.retry_attempts + 1,
      last_retry_at = now(),
      updated_at = now()
    FROM candidates
    WHERE c.id = candidates.id
    RETURNING
      c.id,
      c.user_id,
      c.retry_attempts
  )
  SELECT
    claimed.id,
    claimed.user_id,
    claimed.retry_attempts
  FROM claimed;
END;
$$;

ALTER FUNCTION public.claim_call_review_retry(integer, integer)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.claim_call_review_retry(integer, integer)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_call_review_retry(integer, integer)
  TO service_role;

-- Keep the schema documentation aligned with the retention function's actual
-- retry policy.
COMMENT ON COLUMN public.conversations.audio_deleted_at IS
  'When the audio object in the recordings Storage bucket was deleted by the retention job. Successful conversations are eligible after 48 hours. Retryable/failed recordings are retained by the retention job so review recovery remains possible; account deletion removes them.';