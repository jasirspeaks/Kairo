-- ===========================================================================
-- Migration: 20261008020000_durable_processing_leases_and_stale_recovery.sql
-- Description:
--   Establishes durable processing leases and bulletproof stale recovery:
--   1. Adds processing_lease_until and processing_token to conversations.
--   2. Updates claim_conversation_review to stamp leases, tokens, and last_retry_at,
--      and permits reclaiming expired leases.
--   3. Updates claim_call_review_retry to recover all expired processing rows
--      (including legacy rows where last_retry_at was NULL or lease was absent)
--      into retry_pending or failed, closing the permanent stranding loophole.
-- ===========================================================================

-- 1. Add lease tracking columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS processing_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS processing_token uuid;

COMMENT ON COLUMN public.conversations.processing_lease_until IS
  'Deadline before which the active worker must complete or renew this review. Expired leases are recovered by retry workers.';

COMMENT ON COLUMN public.conversations.processing_token IS
  'Unique token assigned on each claim to prevent stale writes from expired workers.';

CREATE INDEX IF NOT EXISTS conversations_processing_lease_idx
  ON public.conversations (processing_lease_until)
  WHERE status = 'processing';

-- 2. Update claim_conversation_review
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
    );
  END IF;

  UPDATE public.conversations AS conv
  SET
    status = 'processing',
    processing_lease_until = now() + interval '5 minutes',
    processing_token = gen_random_uuid(),
    last_retry_at = COALESCE(conv.last_retry_at, now()),
    retry_after = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE conv.id = p_conversation_id
    AND conv.user_id = p_user_id
    AND (
      conv.status IN ('pending', 'retry_pending')
      OR (
        conv.status = 'processing' AND (
          (conv.processing_lease_until IS NOT NULL AND conv.processing_lease_until < now())
          OR (conv.processing_lease_until IS NULL AND (
            (conv.last_retry_at IS NOT NULL AND conv.last_retry_at < now() - interval '5 minutes')
            OR (conv.last_retry_at IS NULL AND conv.updated_at < now() - interval '5 minutes')
          ))
        )
      )
    );

  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.claim_conversation_review(uuid, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO service_role;

-- 3. Update claim_call_review_retry
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
  -- A. Recover orphaned pending conversations that were never claimed after 2 minutes
  UPDATE public.conversations AS conv
  SET
    status = 'retry_pending',
    retry_after = now(),
    processing_lease_until = NULL,
    updated_at = now()
  WHERE conv.status = 'pending'
    AND conv.created_at < now() - interval '2 minutes'
    AND conv.deal_id IS NOT NULL
    AND (
      conv.transcript IS NOT NULL
      OR conv.audio_deleted_at IS NULL
    );

  -- B. Recover jobs whose processing lease expired or timed out (including initial claims)
  UPDATE public.conversations AS conv
  SET
    status = 'retry_pending',
    retry_after = now(),
    processing_lease_until = NULL,
    updated_at = now()
  WHERE conv.status = 'processing'
    AND (
      (conv.processing_lease_until IS NOT NULL AND conv.processing_lease_until < now())
      OR (conv.processing_lease_until IS NULL AND (
        (conv.last_retry_at IS NOT NULL AND conv.last_retry_at < now() - interval '5 minutes')
        OR (conv.last_retry_at IS NULL AND conv.updated_at < now() - interval '5 minutes')
      ))
    )
    AND conv.retry_attempts < p_max_attempts
    AND conv.deal_id IS NOT NULL
    AND (
      conv.transcript IS NOT NULL
      OR conv.audio_deleted_at IS NULL
    );

  -- C. Exhausted attempts become terminally failed
  UPDATE public.conversations AS conv
  SET
    status = 'failed',
    retry_after = NULL,
    processing_lease_until = NULL,
    updated_at = now()
  WHERE conv.status = 'processing'
    AND (
      (conv.processing_lease_until IS NOT NULL AND conv.processing_lease_until < now())
      OR (conv.processing_lease_until IS NULL AND (
        (conv.last_retry_at IS NOT NULL AND conv.last_retry_at < now() - interval '5 minutes')
        OR (conv.last_retry_at IS NULL AND conv.updated_at < now() - interval '5 minutes')
      ))
    )
    AND conv.retry_attempts >= p_max_attempts;

  -- D. Atomically claim next batch of retry_pending candidates
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
      processing_lease_until = now() + interval '5 minutes',
      processing_token = gen_random_uuid(),
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

ALTER FUNCTION public.claim_call_review_retry(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_call_review_retry(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_call_review_retry(integer, integer) TO service_role;
