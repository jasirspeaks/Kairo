-- Recover orphaned pending conversations in claim_call_review_retry.
--
-- If a client writes a conversation row (WAL) but disconnects or crashes
-- before delivering the review trigger, any row remaining in 'pending' for
-- > 2 minutes is automatically recovered into 'retry_pending' and processed.

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
  -- Recover orphaned pending conversations that were never claimed after 2 minutes
  -- (e.g. client crashed or closed browser right after write-ahead persistence).
  UPDATE public.conversations
  SET
    status = 'retry_pending',
    retry_after = now(),
    updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '2 minutes'
    AND deal_id IS NOT NULL
    AND (
      transcript IS NOT NULL
      OR audio_deleted_at IS NULL
    );

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

-- Allow normal callers to claim conversations in both 'pending' and 'retry_pending' status.
CREATE OR REPLACE FUNCTION public.claim_conversation_review(
  p_conversation_id uuid,
  p_user_id uuid,
  p_retry boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_owner uuid;
BEGIN
  v_role := (SELECT auth.role());

  SELECT c.user_id
  INTO v_owner
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role <> 'service_role' AND (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_retry THEN
    IF v_role <> 'service_role' THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = p_conversation_id
        AND c.user_id = p_user_id
        AND c.status = 'processing'
        AND c.retry_attempts > 0
        AND c.last_retry_at IS NOT NULL
    );
  END IF;

  UPDATE public.conversations
  SET
    status = 'processing',
    retry_after = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND status IN ('pending', 'retry_pending')
  RETURNING id;

  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.claim_conversation_review(uuid, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO service_role;

