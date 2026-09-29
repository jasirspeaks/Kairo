-- Kairo security, integrity, quota and persistence hardening.
--
-- This migration is deliberately additive/replacement-only. It does not delete
-- business data. It tightens client write permissions, prevents cross-tenant
-- deal references, adds an atomic review write-back RPC, adds an atomic review
-- quota, and adds Fireflies webhook idempotency.

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 1) Subscription write gate: a trial only writes while its trial_end is
--    still in the future. This closes the gap where the expiry cron is late.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_write_access(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND uid = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = uid
        AND (
          s.status = 'active'
          OR (
            s.status = 'trialing'
            AND s.trial_end > now()
          )
        )
    );
$$;

ALTER FUNCTION public.has_write_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_write_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_write_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Cross-tenant write protection.
--    An authenticated caller may only attach a deal_id that belongs to the
--    same authenticated user. The checks are duplicated in WITH CHECK so an
--    existing row cannot be retargeted at somebody else's deal.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "deals_insert_own" ON public.deals;
DROP POLICY IF EXISTS "deals_update_own" ON public.deals;
DROP POLICY IF EXISTS "deals_delete_own" ON public.deals;

CREATE POLICY "deals_insert_own" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

CREATE POLICY "deals_update_own" ON public.deals
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

CREATE POLICY "deals_delete_own" ON public.deals
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "conversations_insert_own" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_own" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_own" ON public.conversations;

CREATE POLICY "conversations_insert_own" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND deal_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "conversations_update_own" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND deal_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "conversations_delete_own" ON public.conversations
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "deal_state_insert_own" ON public.deal_state;
DROP POLICY IF EXISTS "deal_state_update_own" ON public.deal_state;
DROP POLICY IF EXISTS "deal_state_delete_own" ON public.deal_state;

CREATE POLICY "deal_state_insert_own" ON public.deal_state
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "deal_state_update_own" ON public.deal_state
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "deal_state_delete_own" ON public.deal_state
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Users manage own stakeholders" ON public.stakeholders;

CREATE POLICY "Users manage own stakeholders" ON public.stakeholders
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert their own schedule intents" ON public.pending_schedule_intents;
DROP POLICY IF EXISTS "Users can delete their own schedule intents" ON public.pending_schedule_intents;

CREATE POLICY "Users can insert their own schedule intents" ON public.pending_schedule_intents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete their own schedule intents" ON public.pending_schedule_intents
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Users can update their own scheduled meetings" ON public.scheduled_meetings;

CREATE POLICY "Users can update their own scheduled meetings" ON public.scheduled_meetings
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND (
      deal_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.deals d
        WHERE d.id = deal_id
          AND d.user_id = (SELECT auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Stakeholder uniqueness. Existing duplicate case-insensitive names for the
--    same deal are collapsed first, keeping the oldest row. This makes the
--    later upsert deterministic and removes a race in the browser implementation.
-- ---------------------------------------------------------------------------
DELETE FROM public.stakeholders s
USING public.stakeholders older
WHERE s.deal_id = older.deal_id
  AND lower(s.name) = lower(older.name)
  AND (
    s.created_at > older.created_at
    OR (s.created_at = older.created_at AND s.id > older.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS stakeholders_deal_name_ci_key
  ON public.stakeholders (deal_id, lower(name));

-- ---------------------------------------------------------------------------
-- 4) Atomic review persistence.
--    This is the single transaction used by manual, mobile and Fireflies
--    review write-back. It owns deal_state, stakeholders, deal stage, risk,
--    and deal lifecycle together.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_deal_review(
  p_deal_id uuid,
  p_user_id uuid,
  p_review jsonb,
  p_resolved_stage text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid;
  v_role text;
  v_status text;
  v_risk_level text;
  v_signal jsonb;
BEGIN
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' AND v_auth_user IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = p_deal_id
      AND d.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  IF v_role <> 'service_role' AND NOT public.has_write_access(p_user_id) THEN
    RAISE EXCEPTION 'Write access is not available';
  END IF;

  IF p_resolved_stage IS NULL OR p_resolved_stage NOT IN (
    'Qualification', 'Discovery', 'Demo', 'Evaluation', 'Alignment',
    'Proposal', 'Negotiation', 'Procurement', 'Decision',
    'Closed Won', 'Closed Lost'
  ) THEN
    RAISE EXCEPTION 'Invalid deal stage';
  END IF;

  v_status := p_review #>> '{deal,status}';

  IF v_status IS NULL OR v_status NOT IN (
    'Unknown', 'Healthy', 'Promising', 'At Risk', 'Critical',
    'Stalled', 'Recovering', 'Won', 'Lost'
  ) THEN
    RAISE EXCEPTION 'Invalid deal status';
  END IF;

  v_risk_level := CASE v_status
    WHEN 'Critical' THEN 'high'
    WHEN 'At Risk' THEN 'high'
    WHEN 'Stalled' THEN 'medium'
    WHEN 'Recovering' THEN 'medium'
    WHEN 'Healthy' THEN 'low'
    WHEN 'Promising' THEN 'low'
    WHEN 'Won' THEN 'low'
    WHEN 'Lost' THEN 'none'
    ELSE 'none'
  END;

  INSERT INTO public.deal_state (
    deal_id,
    user_id,
    current_status,
    confidence,
    deal_health_score,
    highest_priority_risk,
    highest_priority_risk_full,
    what_youre_missing,
    key_follow_up_message,
    manager_note,
    supporting_evidence,
    last_review_summary,
    pillars,
    updated_at
  )
  VALUES (
    p_deal_id,
    p_user_id,
    v_status,
    p_review #>> '{deal,confidence}',
    GREATEST(0, LEAST(100, COALESCE((p_review #>> '{deal,health_score}')::integer, 0))),
    p_review #>> '{deal,highest_priority_risk,risk}',
    COALESCE(p_review #> '{deal,highest_priority_risk}', '{}'::jsonb),
    COALESCE(p_review #> '{deal,what_youre_missing}', '[]'::jsonb),
    COALESCE(p_review #>> '{deal,recommended_next_action}', ''),
    COALESCE(p_review #>> '{deal,manager_note}', ''),
    COALESCE(p_review->'supporting_evidence', '[]'::jsonb),
    COALESCE(p_review #>> '{deal,status_reason}', ''),
    COALESCE(p_review #> '{deal,pillars}', NULL),
    now()
  )
  ON CONFLICT (deal_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    current_status = EXCLUDED.current_status,
    confidence = EXCLUDED.confidence,
    deal_health_score = EXCLUDED.deal_health_score,
    highest_priority_risk = EXCLUDED.highest_priority_risk,
    highest_priority_risk_full = EXCLUDED.highest_priority_risk_full,
    what_youre_missing = EXCLUDED.what_youre_missing,
    key_follow_up_message = EXCLUDED.key_follow_up_message,
    manager_note = EXCLUDED.manager_note,
    supporting_evidence = EXCLUDED.supporting_evidence,
    last_review_summary = EXCLUDED.last_review_summary,
    pillars = EXCLUDED.pillars,
    updated_at = EXCLUDED.updated_at;

  FOR v_signal IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_review->'stakeholder_signals', '[]'::jsonb))
  LOOP
    IF NULLIF(trim(v_signal->>'name'), '') IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stakeholders (
      deal_id,
      user_id,
      name,
      role,
      sentiment,
      notes,
      updated_at
    )
    VALUES (
      p_deal_id,
      p_user_id,
      trim(v_signal->>'name'),
      NULLIF(v_signal->>'role', ''),
      NULLIF(v_signal->>'sentiment', ''),
      NULLIF(v_signal->>'evidence', ''),
      now()
    )
    ON CONFLICT (deal_id, lower(name)) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      sentiment = EXCLUDED.sentiment,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  UPDATE public.deals
  SET
    deal_stage = p_resolved_stage,
    risk_level = v_risk_level,
    status = CASE v_status
      WHEN 'Won' THEN 'won'
      WHEN 'Lost' THEN 'lost'
      WHEN 'Stalled' THEN 'stalled'
      ELSE 'active'
    END,
    updated_at = now()
  WHERE id = p_deal_id
    AND user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Atomic review quota for direct/user-originated call-review requests.
--    Internal service-role review calls are not charged against this bucket;
--    otherwise Fireflies/retry would consume the user's manual quota.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_usage_events_user_created_idx
  ON public.review_usage_events (user_id, created_at DESC);

ALTER TABLE public.review_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_usage_events FROM anon;
REVOKE ALL ON TABLE public.review_usage_events FROM authenticated;
GRANT ALL ON TABLE public.review_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.consume_review_quota(
  p_user_id uuid,
  p_max_reviews integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid;
  v_role text;
  v_count integer;
BEGIN
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' AND v_auth_user IS DISTINCT FROM p_user_id THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND (
      s.status = 'active'
      OR (s.status = 'trialing' AND s.trial_end > now())
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.review_usage_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '24 hours';

  IF v_count >= GREATEST(p_max_reviews, 1) THEN
    RETURN false;
  END IF;

  INSERT INTO public.review_usage_events (user_id)
  VALUES (p_user_id);

  RETURN true;
END;
$$;

ALTER FUNCTION public.consume_review_quota(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consume_review_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Fireflies webhook idempotency / retry claim.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fireflies_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fireflies_webhook_events_status_check
    CHECK (status IN ('processing', 'complete', 'failed')),
  CONSTRAINT fireflies_webhook_events_user_meeting_key
    UNIQUE (user_id, meeting_id)
);

CREATE INDEX IF NOT EXISTS fireflies_webhook_events_status_claimed_idx
  ON public.fireflies_webhook_events (status, claimed_at);

ALTER TABLE public.fireflies_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fireflies_webhook_events FROM anon;
REVOKE ALL ON TABLE public.fireflies_webhook_events FROM authenticated;
GRANT ALL ON TABLE public.fireflies_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_fireflies_webhook(
  p_user_id uuid,
  p_meeting_id text
)
RETURNS TABLE (
  claimed boolean,
  event_id uuid,
  conversation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_role text;
  v_row public.fireflies_webhook_events%ROWTYPE;
BEGIN
  v_auth_role := (SELECT auth.role());

  IF v_auth_role <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NULLIF(trim(p_meeting_id), '') IS NULL THEN
    RAISE EXCEPTION 'Missing meeting id';
  END IF;

  INSERT INTO public.fireflies_webhook_events (user_id, meeting_id, status, claimed_at)
  VALUES (p_user_id, p_meeting_id, 'processing', now())
  ON CONFLICT (user_id, meeting_id) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT true, id, conversation_id
    FROM public.fireflies_webhook_events
    WHERE user_id = p_user_id
      AND meeting_id = p_meeting_id;
    RETURN;
  END IF;

  SELECT *
  INTO v_row
  FROM public.fireflies_webhook_events
  WHERE user_id = p_user_id
    AND meeting_id = p_meeting_id
  FOR UPDATE;

  IF v_row.status = 'complete' THEN
    RETURN QUERY SELECT false, v_row.id, v_row.conversation_id;
    RETURN;
  END IF;

  IF v_row.status = 'processing' AND v_row.claimed_at >= now() - interval '15 minutes' THEN
    RETURN QUERY SELECT false, v_row.id, v_row.conversation_id;
    RETURN;
  END IF;

  UPDATE public.fireflies_webhook_events
  SET
    status = 'processing',
    claimed_at = now(),
    completed_at = NULL,
    conversation_id = NULL,
    last_error = NULL
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, v_row.id, NULL::uuid;
END;
$$;

ALTER FUNCTION public.claim_fireflies_webhook(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_fireflies_webhook(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fireflies_webhook(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_fireflies_webhook(
  p_event_id uuid,
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.fireflies_webhook_events
  SET
    status = 'complete',
    conversation_id = p_conversation_id,
    completed_at = now(),
    last_error = NULL
  WHERE id = p_event_id;
END;
$$;

ALTER FUNCTION public.finish_fireflies_webhook(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finish_fireflies_webhook(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_fireflies_webhook(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_fireflies_webhook(
  p_event_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.fireflies_webhook_events
  SET
    status = 'failed',
    completed_at = NULL,
    last_error = left(coalesce(p_error, 'Unknown error'), 2000)
  WHERE id = p_event_id;
END;
$$;

ALTER FUNCTION public.fail_fireflies_webhook(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fail_fireflies_webhook(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_fireflies_webhook(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Atomic mobile-review claim.
--    Normal callers may claim pending/retry_pending. A retry worker already
--    owns a row in processing, so it passes p_retry=true and does not race a
--    normal caller into a second analysis.
-- ---------------------------------------------------------------------------
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
    AND status = 'pending'
  RETURNING id;

  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.claim_conversation_review(uuid, uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_review(uuid, uuid, boolean) TO service_role;

-- Schema comments for future maintainers.
COMMENT ON TABLE public.review_usage_events IS
  'One row per direct/user-originated call-review request. Used for an atomic 20-per-24h quota.';
COMMENT ON TABLE public.fireflies_webhook_events IS
  'Durable idempotency ledger for Fireflies transcript webhook processing.';
