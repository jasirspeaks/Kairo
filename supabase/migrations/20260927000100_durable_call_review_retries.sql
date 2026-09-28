-- Durable retry state for mobile/audio call reviews.
--
-- The important distinction is:
--
--   failed        = terminal / historical failure
--   retry_pending = the review material is still valid and should be retried
--   complete      = review succeeded
--
-- We deliberately keep the source transcript/audio attached while a review
-- is retryable. This prevents a transient Gemini/API failure from becoming
-- permanent data loss.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS retry_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.conversations.retry_attempts IS
  'Number of automatic review retry attempts made for this conversation.';

COMMENT ON COLUMN public.conversations.retry_after IS
  'Earliest time at which the retry worker should attempt this conversation again.';

COMMENT ON COLUMN public.conversations.last_retry_at IS
  'Timestamp of the most recent automatic retry attempt.';

COMMENT ON COLUMN public.conversations.last_error IS
  'Most recent error encountered while processing this conversation.';

CREATE INDEX IF NOT EXISTS conversations_retry_queue_idx
  ON public.conversations (retry_after, created_at)
  WHERE status = 'retry_pending';


-- Atomically claim retryable conversations.
--
-- FOR UPDATE SKIP LOCKED means two worker invocations cannot claim the same
-- conversation simultaneously.

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
  RETURN QUERY
  WITH candidates AS (
    SELECT c.id
    FROM public.conversations c
    WHERE c.status = 'retry_pending'
      AND c.retry_after IS NOT NULL
      AND c.retry_after <= now()
      AND c.retry_attempts < p_max_attempts
      AND c.audio_deleted_at IS NULL
    ORDER BY c.retry_after ASC, c.created_at ASC
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
    RETURNING c.id, c.user_id, c.retry_attempts
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