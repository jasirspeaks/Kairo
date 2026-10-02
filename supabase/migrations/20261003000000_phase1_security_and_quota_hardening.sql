-- Phase 1: Security, Quota & Transaction Hardening
-- 1. Tighten calendar_connections security: tokens are service_role-only.
-- 2. Add secure get_calendar_connection_status() RPC for client-side status check.
-- 3. Add idempotency_key and event_id tracking to review_usage_events.
-- 4. Update consume_review_quota to return event_id and status as jsonb.
-- 5. Add refund_review_quota RPC to eliminate quota rollback race conditions.
-- 6. Lock deal row in persist_deal_review for row-level transaction isolation.

-- ---------------------------------------------------------------------------
-- 1) Google Calendar Token Security: Drop client RLS policies & revoke public access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own calendar connection" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can insert their own calendar connection" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can update their own calendar connection" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can delete their own calendar connection" ON public.calendar_connections;

REVOKE ALL ON TABLE public.calendar_connections FROM anon;
REVOKE ALL ON TABLE public.calendar_connections FROM authenticated;
GRANT ALL ON TABLE public.calendar_connections TO service_role;
GRANT ALL ON TABLE public.calendar_connections TO postgres;

-- ---------------------------------------------------------------------------
-- 2) Safe Calendar Connection Status RPC (no raw tokens returned)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_calendar_connection_status()
RETURNS TABLE (
  connected boolean,
  provider text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true AS connected,
    c.provider,
    c.updated_at
  FROM public.calendar_connections c
  WHERE c.user_id = v_uid
    AND c.provider = 'google';
END;
$$;

ALTER FUNCTION public.get_calendar_connection_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_calendar_connection_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_calendar_connection_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_connection_status() TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Review Usage Events: Idempotency support
-- ---------------------------------------------------------------------------
ALTER TABLE public.review_usage_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS review_usage_events_user_idempotency_idx
  ON public.review_usage_events (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Consume Review Quota (Returns JSON with status & event_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.consume_review_quota(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_review_quota(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.consume_review_quota(
  p_user_id uuid,
  p_max_reviews integer DEFAULT 20,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid;
  v_role text;
  v_count integer;
  v_event_id uuid;
  v_existing_id uuid;
BEGIN
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' AND v_auth_user IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('status', 'not_allowed');
  END IF;

  -- Check existing idempotency record
  IF p_idempotency_key IS NOT NULL THEN
    SELECT e.id INTO v_existing_id
    FROM public.review_usage_events e
    WHERE e.user_id = p_user_id
      AND e.idempotency_key = p_idempotency_key
      AND e.created_at > now() - interval '24 hours';

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'ok',
        'event_id', v_existing_id,
        'idempotent', true
      );
    END IF;
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
    RETURN jsonb_build_object('status', 'not_allowed');
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.review_usage_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '24 hours';

  IF v_count >= GREATEST(p_max_reviews, 1) THEN
    RETURN jsonb_build_object('status', 'quota_exceeded');
  END IF;

  INSERT INTO public.review_usage_events (user_id, idempotency_key)
  VALUES (p_user_id, p_idempotency_key)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'event_id', v_event_id,
    'idempotent', false
  );
END;
$$;

ALTER FUNCTION public.consume_review_quota(uuid, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consume_review_quota(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Targeted Quota Refund RPC (Eliminating concurrency rollback race)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_review_quota(
  p_event_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid;
  v_role text;
BEGIN
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' AND v_auth_user IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.review_usage_events
  WHERE id = p_event_id
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

ALTER FUNCTION public.refund_review_quota(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.refund_review_quota(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_review_quota(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_review_quota(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Row-Level Concurrency Lock in persist_deal_review
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

  -- Acquire row lock on deal for transaction isolation
  PERFORM 1
  FROM public.deals d
  WHERE d.id = p_deal_id
    AND d.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
