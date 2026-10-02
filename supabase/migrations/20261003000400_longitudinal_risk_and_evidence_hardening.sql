-- Migration: 20261003000400_longitudinal_risk_and_evidence_hardening.sql
-- Phase 1: Database & RPC Hardening (Zero Downtime / Non-Breaking)
-- 1. Add risk_category and fingerprint columns to deal_risks for deterministic longitudinal tracking.
-- 2. Add ai_inference_id to deal_evidence for audit provenance.
-- 3. Ensure base table public.meetings is in supabase_realtime publication.
-- 4. Upgrade persist_deal_review RPC to atomically merge recurring risks, increment consecutive counts,
--    escalate severity, and ingest structured evidence without breaking legacy callers.

-- ---------------------------------------------------------------------------
-- 1) Schema Additions: deal_risks & deal_evidence
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_risks
  ADD COLUMN IF NOT EXISTS risk_category text,
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS deal_risks_active_fingerprint_idx
  ON public.deal_risks (deal_id, fingerprint)
  WHERE status IN ('active', 'recurring');

ALTER TABLE public.deal_evidence
  ADD COLUMN IF NOT EXISTS ai_inference_id uuid REFERENCES public.ai_inferences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deal_evidence_ai_inference_id_idx
  ON public.deal_evidence (ai_inference_id);

-- ---------------------------------------------------------------------------
-- 2) Realtime Publication Guard for Base Table meetings
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meetings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Upgraded Atomic persist_deal_review RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_deal_review(
  p_deal_id uuid,
  p_user_id uuid,
  p_review jsonb,
  p_resolved_stage text,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid;
  v_role text;
  v_old_stage text;
  v_old_status text;
  v_old_health integer;
  v_status text;
  v_risk_level text;
  v_signal jsonb;
  v_evidence_item jsonb;
  v_pillar_key text;
  v_pillar_obj jsonb;
  v_new_health integer;
  v_high_risk_title text;
  v_high_risk_why text;
  v_high_risk_cat text;
  v_fingerprint text;
  v_existing_risk_id uuid;
  v_consecutive_calls integer;
  v_existing_severity text;
  v_next_consecutive integer;
  v_escalated_severity text;
  v_res_elem jsonb;
  v_resolved_text text;
  v_resolved_cat text;
  v_meeting_id uuid;
BEGIN
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' AND v_auth_user IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Read and lock current deal state for transaction isolation
  SELECT deal_stage, status
  INTO v_old_stage, v_old_status
  FROM public.deals
  WHERE id = p_deal_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  SELECT deal_health_score
  INTO v_old_health
  FROM public.deal_state
  WHERE deal_id = p_deal_id;

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

  v_new_health := GREATEST(0, LEAST(100, COALESCE((p_review #>> '{deal,health_score}')::integer, 0)));

  -- Fetch associated meeting_id if conversation is provided
  IF p_conversation_id IS NOT NULL THEN
    SELECT meeting_id INTO v_meeting_id
    FROM public.conversations
    WHERE id = p_conversation_id;
  END IF;

  -- 1) Update / Upsert deal_state
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
    v_new_health,
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

  -- 2) Append Pillar History
  IF p_review #> '{deal,pillars}' IS NOT NULL AND p_conversation_id IS NOT NULL THEN
    FOREACH v_pillar_key IN ARRAY ARRAY['compelling_event', 'economic_buyer', 'decision_process', 'budget', 'champion']
    LOOP
      v_pillar_obj := p_review #> ARRAY['deal', 'pillars', v_pillar_key];
      IF v_pillar_obj IS NOT NULL THEN
        INSERT INTO public.deal_pillar_history (
          deal_id,
          conversation_id,
          pillar_key,
          status,
          confidence,
          evidence_text,
          created_at
        )
        VALUES (
          p_deal_id,
          p_conversation_id,
          v_pillar_key,
          COALESCE(v_pillar_obj->>'status', 'unconfirmed'),
          COALESCE((v_pillar_obj->>'confidence')::integer, 0),
          COALESCE(v_pillar_obj->>'evidence', ''),
          now()
        );
      END IF;
    END LOOP;
  END IF;

  -- 3) Maintain Durable Longitudinal Risks Ledger
  v_high_risk_title := NULLIF(trim(p_review #>> '{deal,highest_priority_risk,risk}'), '');
  v_high_risk_why := NULLIF(trim(p_review #>> '{deal,highest_priority_risk,why_it_matters}'), '');
  v_high_risk_cat := NULLIF(trim(p_review #>> '{deal,highest_priority_risk,category}'), '');

  IF v_high_risk_title IS NOT NULL THEN
    v_fingerprint := COALESCE(
      v_high_risk_cat,
      lower(regexp_replace(trim(v_high_risk_title), '[^a-zA-Z0-9]+', '_', 'g'))
    );

    -- Check if an active or recurring risk matches this deal and fingerprint/title
    SELECT id, consecutive_unresolved_calls, severity
    INTO v_existing_risk_id, v_consecutive_calls, v_existing_severity
    FROM public.deal_risks
    WHERE deal_id = p_deal_id
      AND status IN ('active', 'recurring')
      AND (
        (v_fingerprint IS NOT NULL AND fingerprint = v_fingerprint)
        OR lower(title) = lower(v_high_risk_title)
      )
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_existing_risk_id IS NOT NULL THEN
      v_next_consecutive := v_consecutive_calls + 1;
      v_escalated_severity := CASE
        WHEN v_next_consecutive >= 3 AND (v_risk_level = 'high' OR v_existing_severity = 'high') THEN 'critical'
        WHEN v_next_consecutive >= 2 AND (v_risk_level = 'medium' OR v_existing_severity = 'medium') THEN 'high'
        ELSE COALESCE(v_risk_level, v_existing_severity, 'high')
      END;

      UPDATE public.deal_risks
      SET
        title = v_high_risk_title,
        why_it_matters = COALESCE(v_high_risk_why, why_it_matters),
        status = 'recurring',
        severity = v_escalated_severity,
        consecutive_unresolved_calls = v_next_consecutive,
        risk_category = COALESCE(v_high_risk_cat, risk_category),
        fingerprint = COALESCE(v_fingerprint, fingerprint),
        updated_at = now()
      WHERE id = v_existing_risk_id;
    ELSE
      INSERT INTO public.deal_risks (
        deal_id,
        title,
        why_it_matters,
        status,
        severity,
        first_identified_call_id,
        consecutive_unresolved_calls,
        risk_category,
        fingerprint,
        updated_at
      )
      VALUES (
        p_deal_id,
        v_high_risk_title,
        v_high_risk_why,
        'active',
        v_risk_level,
        p_conversation_id,
        1,
        v_high_risk_cat,
        v_fingerprint,
        now()
      );
    END IF;
  END IF;

  -- Mark resolved risks if delta provided in what_changed_since_last_call
  IF p_review #> '{what_changed_since_last_call,resolved}' IS NOT NULL THEN
    FOR v_res_elem IN
      SELECT value FROM jsonb_array_elements(p_review #> '{what_changed_since_last_call,resolved}')
    LOOP
      IF jsonb_typeof(v_res_elem) = 'string' THEN
        v_resolved_text := trim(v_res_elem #>> '{}');
        v_resolved_cat := NULL;
      ELSIF jsonb_typeof(v_res_elem) = 'object' THEN
        v_resolved_text := trim(COALESCE(v_res_elem->>'risk', v_res_elem->>'title', ''));
        v_resolved_cat := NULLIF(trim(v_res_elem->>'category'), '');
      ELSE
        CONTINUE;
      END IF;

      IF length(v_resolved_text) > 0 OR v_resolved_cat IS NOT NULL THEN
        UPDATE public.deal_risks
        SET
          status = 'resolved',
          resolved_call_id = p_conversation_id,
          updated_at = now()
        WHERE deal_id = p_deal_id
          AND status IN ('active', 'recurring')
          AND (
            (v_resolved_cat IS NOT NULL AND (risk_category = v_resolved_cat OR fingerprint = v_resolved_cat))
            OR (length(v_resolved_text) > 0 AND (
              lower(title) = lower(v_resolved_text)
              OR position(lower(v_resolved_text) in lower(title)) > 0
              OR position(lower(title) in lower(v_resolved_text)) > 0
            ))
          );
      END IF;
    END LOOP;
  END IF;

  -- 4) Append Grounded Evidence (Supports both string array & structured object array)
  IF p_conversation_id IS NOT NULL AND p_review->'supporting_evidence' IS NOT NULL THEN
    FOR v_evidence_item IN
      SELECT value FROM jsonb_array_elements(p_review->'supporting_evidence')
    LOOP
      IF jsonb_typeof(v_evidence_item) = 'string' THEN
        IF length(trim(v_evidence_item #>> '{}')) > 0 THEN
          INSERT INTO public.deal_evidence (
            deal_id,
            conversation_id,
            meeting_id,
            quote,
            grounding_type,
            confidence,
            created_at
          )
          VALUES (
            p_deal_id,
            p_conversation_id,
            v_meeting_id,
            trim(v_evidence_item #>> '{}'),
            'explicit_statement',
            100,
            now()
          );
        END IF;
      ELSIF jsonb_typeof(v_evidence_item) = 'object' THEN
        IF length(trim(COALESCE(v_evidence_item->>'quote', ''))) > 0 THEN
          INSERT INTO public.deal_evidence (
            deal_id,
            conversation_id,
            meeting_id,
            quote,
            speaker,
            pillar_key,
            grounding_type,
            confidence,
            created_at
          )
          VALUES (
            p_deal_id,
            p_conversation_id,
            v_meeting_id,
            trim(v_evidence_item->>'quote'),
            NULLIF(trim(v_evidence_item->>'speaker'), ''),
            NULLIF(trim(v_evidence_item->>'pillar_key'), ''),
            COALESCE(NULLIF(trim(v_evidence_item->>'grounding_type'), ''), 'explicit_statement'),
            GREATEST(0, LEAST(100, COALESCE((v_evidence_item->>'confidence')::integer, 100))),
            now()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 5) Log State Transition if stage or status moved
  IF v_old_stage IS DISTINCT FROM p_resolved_stage OR v_old_status IS DISTINCT FROM v_status THEN
    INSERT INTO public.deal_state_transitions (
      deal_id,
      conversation_id,
      from_stage,
      to_stage,
      from_status,
      to_status,
      health_score_delta,
      transition_reason,
      created_at
    )
    VALUES (
      p_deal_id,
      p_conversation_id,
      v_old_stage,
      p_resolved_stage,
      v_old_status,
      v_status,
      COALESCE(v_new_health - COALESCE(v_old_health, v_new_health), 0),
      COALESCE(p_review #>> '{deal,status_reason}', ''),
      now()
    );
  END IF;

  -- 6) Upsert Stakeholders
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

  -- 7) Update Deal Record
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

ALTER FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) TO service_role;
