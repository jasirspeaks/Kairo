-- ===========================================================================
-- Migration: 20261006180000_canonical_stage_progression_concurrency_fix.sql
-- Description:
--   Hardens persist_deal_review RPC to atomically evaluate monotonic stage
--   progression under the deal row-level exclusive lock. This eliminates race
--   conditions where concurrent call reviews could overwrite newer deal stages
--   with older stages computed from stale pre-lock reads.
-- ===========================================================================

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
  v_target_user uuid;
  v_status text;
  v_risk_level text;
  v_new_health integer;
  v_curr_health integer;
  v_old_stage text;
  v_old_status text;
  v_prev_stage text;
  v_target_stage text;
  v_old_idx integer;
  v_new_idx integer;
  v_pillar_key text;
  v_pillar_obj jsonb;
  v_evidence_item jsonb;
  v_meeting_id uuid;
  v_sig jsonb;
  v_stakeholder_name text;

  -- Risk processing variables
  v_risk_item jsonb;
  v_risk_title text;
  v_risk_why text;
  v_risk_cat text;
  v_fingerprint text;
  v_existing_risk_id uuid;
  v_existing_status text;
  v_consecutive_calls integer;
  v_existing_severity text;
  v_next_consecutive integer;
  v_escalated_severity text;

  -- Resolved risk variables
  v_res_elem jsonb;
  v_resolved_text text;
  v_resolved_cat text;
  v_target_fp text;
  v_processed_fps text[] := ARRAY[]::text[];
BEGIN
  -- -------------------------------------------------------------------------
  -- 0) Strict Identity & Role Authorization Verification
  -- -------------------------------------------------------------------------
  v_auth_user := (SELECT auth.uid());
  v_role := (SELECT auth.role());

  IF v_role <> 'service_role' THEN
    IF v_auth_user IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated caller required';
    END IF;
    IF v_auth_user IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: user ID mismatch';
    END IF;
    v_target_user := v_auth_user;
  ELSE
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: user ID required for service_role call';
    END IF;
    v_target_user := p_user_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 1) Acquire Row-Level Exclusive Lock on Deal for Transactional Concurrency
  -- -------------------------------------------------------------------------
  PERFORM 1
  FROM public.deals d
  WHERE d.id = p_deal_id
    AND d.user_id = v_target_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found or unauthorized for user %', v_target_user;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2) Quota & Write Access Verification
  -- -------------------------------------------------------------------------
  IF v_role <> 'service_role' AND NOT public.has_write_access(v_target_user) THEN
    RAISE EXCEPTION 'Write access is not available';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3) Stage & Status Validation & Atomic Monotonic Resolution
  -- -------------------------------------------------------------------------
  IF p_resolved_stage IS NULL OR p_resolved_stage NOT IN (
    'Qualification', 'Discovery', 'Demo', 'Evaluation', 'Alignment',
    'Proposal', 'Negotiation', 'Procurement', 'Decision',
    'Closed Won', 'Closed Lost'
  ) THEN
    RAISE EXCEPTION 'Invalid deal stage: %', p_resolved_stage;
  END IF;

  -- Fetch current deal state AFTER obtaining lock to prevent race conditions
  SELECT deal_stage INTO v_old_stage FROM public.deals WHERE id = p_deal_id;
  SELECT current_status, deal_health_score INTO v_old_status, v_curr_health
  FROM public.deal_state WHERE deal_id = p_deal_id;

  v_status := p_review #>> '{deal,status}';
  v_new_health := COALESCE((p_review #>> '{deal,health_score}')::integer, 0);

  -- Derive canonical target stage under transaction lock to prevent race regressions
  IF v_status = 'Won' THEN
    v_target_stage := 'Closed Won';
  ELSIF v_status = 'Lost' THEN
    v_target_stage := 'Closed Lost';
  ELSIF (p_review #>> '{deal,stage_regression_override}')::boolean IS TRUE THEN
    v_target_stage := p_resolved_stage;
  ELSE
    IF v_old_stage IN ('Closed Won', 'Closed Lost') THEN
      v_target_stage := v_old_stage;
    ELSE
      -- Canonical stage order indices
      v_old_idx := array_position(ARRAY['Qualification', 'Discovery', 'Demo', 'Evaluation', 'Alignment', 'Proposal', 'Negotiation', 'Procurement', 'Decision'], v_old_stage);
      v_new_idx := array_position(ARRAY['Qualification', 'Discovery', 'Demo', 'Evaluation', 'Alignment', 'Proposal', 'Negotiation', 'Procurement', 'Decision'], p_resolved_stage);

      IF v_old_idx IS NOT NULL AND v_new_idx IS NOT NULL AND v_new_idx >= v_old_idx THEN
        v_target_stage := p_resolved_stage;
      ELSE
        v_target_stage := COALESCE(v_old_stage, p_resolved_stage);
      END IF;
    END IF;
  END IF;

  -- Fetch previous reviewed conversation stage for accurate stage delta
  SELECT deal_stage INTO v_prev_stage
  FROM public.conversations
  WHERE deal_id = p_deal_id
    AND (p_conversation_id IS NULL OR id <> p_conversation_id)
    AND deal_stage IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Derive risk level
  CASE v_status
    WHEN 'Critical' THEN v_risk_level := 'high';
    WHEN 'At Risk' THEN v_risk_level := 'high';
    WHEN 'Stalled' THEN v_risk_level := 'medium';
    WHEN 'Recovering' THEN v_risk_level := 'medium';
    WHEN 'Healthy' THEN v_risk_level := 'low';
    WHEN 'Promising' THEN v_risk_level := 'low';
    WHEN 'Won' THEN v_risk_level := 'none';
    WHEN 'Lost' THEN v_risk_level := 'none';
    ELSE v_risk_level := 'none';
  END CASE;

  -- Update base deal row
  UPDATE public.deals
  SET
    deal_stage = v_target_stage,
    risk_level = v_risk_level,
    champion = COALESCE(
      (SELECT s->>'name' FROM jsonb_array_elements(COALESCE(p_review->'stakeholder_signals', '[]'::jsonb)) s WHERE s->>'sentiment' = 'champion' LIMIT 1),
      champion
    ),
    updated_at = now()
  WHERE id = p_deal_id
    AND user_id = v_target_user;

  -- -------------------------------------------------------------------------
  -- 4) Upsert deal_state
  -- -------------------------------------------------------------------------
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
    v_target_user,
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

  -- -------------------------------------------------------------------------
  -- 5) Append Pillar History
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- 6) Durable Longitudinal Risks Ledger: Persist ALL Meaningful Active Risks
  -- -------------------------------------------------------------------------
  FOR v_risk_item IN
    SELECT p_review #> '{deal,highest_priority_risk}' AS item
    WHERE p_review #> '{deal,highest_priority_risk}' IS NOT NULL
      AND length(trim(COALESCE(p_review #>> '{deal,highest_priority_risk,risk}', ''))) > 0
    UNION ALL
    SELECT value AS item
    FROM jsonb_array_elements(COALESCE(p_review #> '{what_changed_since_last_call,persists}', '[]'::jsonb))
    UNION ALL
    SELECT value AS item
    FROM jsonb_array_elements(COALESCE(p_review #> '{what_changed_since_last_call,new_risks}', '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_risk_item) = 'string' THEN
      v_risk_title := trim(v_risk_item #>> '{}');
      v_risk_why := NULL;
      v_risk_cat := 'general_risk';
    ELSIF jsonb_typeof(v_risk_item) = 'object' THEN
      v_risk_title := trim(COALESCE(v_risk_item->>'risk', v_risk_item->>'title', ''));
      v_risk_why := NULLIF(trim(COALESCE(v_risk_item->>'why_it_matters', '')), '');
      v_risk_cat := COALESCE(NULLIF(trim(COALESCE(v_risk_item->>'category', '')), ''), 'general_risk');
    ELSE
      CONTINUE;
    END IF;

    IF length(v_risk_title) = 0 THEN
      CONTINUE;
    END IF;

    -- Compute semantic fingerprint: category + normalized concept
    v_fingerprint := v_risk_cat || ':' || public.compute_risk_concept(v_risk_title);

    -- Skip duplicate risks within the same call review
    IF v_fingerprint = ANY(v_processed_fps) THEN
      CONTINUE;
    END IF;
    v_processed_fps := array_append(v_processed_fps, v_fingerprint);

    -- Find matching risk record
    SELECT id, status, consecutive_unresolved_calls, severity
    INTO v_existing_risk_id, v_existing_status, v_consecutive_calls, v_existing_severity
    FROM public.deal_risks
    WHERE deal_id = p_deal_id
      AND (
        fingerprint = v_fingerprint
        OR lower(title) = lower(v_risk_title)
      )
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_existing_risk_id IS NOT NULL THEN
      -- If was previously resolved/mitigated, reopen it
      IF v_existing_status = 'resolved' OR v_existing_status = 'mitigated' THEN
        v_next_consecutive := 1;
        v_escalated_severity := COALESCE(v_risk_level, 'high');

        UPDATE public.deal_risks
        SET
          title = v_risk_title,
          why_it_matters = COALESCE(v_risk_why, why_it_matters),
          status = 'active',
          severity = v_escalated_severity,
          consecutive_unresolved_calls = v_next_consecutive,
          risk_category = v_risk_cat,
          fingerprint = v_fingerprint,
          resolved_call_id = NULL,
          updated_at = now()
        WHERE id = v_existing_risk_id;
      ELSE
        -- Recurring risk: increment consecutive count and escalate
        v_next_consecutive := v_consecutive_calls + 1;
        v_escalated_severity := CASE
          WHEN v_next_consecutive >= 3 AND (v_risk_level = 'high' OR v_existing_severity = 'high') THEN 'critical'
          WHEN v_next_consecutive >= 2 AND (v_risk_level = 'medium' OR v_existing_severity = 'medium') THEN 'high'
          ELSE COALESCE(v_risk_level, v_existing_severity, 'high')
        END;

        UPDATE public.deal_risks
        SET
          title = v_risk_title,
          why_it_matters = COALESCE(v_risk_why, why_it_matters),
          status = 'recurring',
          severity = v_escalated_severity,
          consecutive_unresolved_calls = v_next_consecutive,
          risk_category = v_risk_cat,
          fingerprint = v_fingerprint,
          updated_at = now()
        WHERE id = v_existing_risk_id;
      END IF;
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
        v_risk_title,
        v_risk_why,
        'active',
        v_risk_level,
        p_conversation_id,
        1,
        v_risk_cat,
        v_fingerprint,
        now()
      );
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 7) Mark Resolved Risks from delta
  -- -------------------------------------------------------------------------
  IF p_review #> '{what_changed_since_last_call,resolved}' IS NOT NULL THEN
    FOR v_res_elem IN
      SELECT value FROM jsonb_array_elements(p_review #> '{what_changed_since_last_call,resolved}')
    LOOP
      IF jsonb_typeof(v_res_elem) = 'string' THEN
        v_resolved_text := trim(v_res_elem #>> '{}');
        v_resolved_cat := '';
      ELSIF jsonb_typeof(v_res_elem) = 'object' THEN
        v_resolved_text := trim(COALESCE(v_res_elem->>'risk', v_res_elem->>'title', ''));
        v_resolved_cat := COALESCE(NULLIF(trim(COALESCE(v_res_elem->>'category', '')), ''), '');
      ELSE
        CONTINUE;
      END IF;

      IF length(v_resolved_text) > 0 OR length(v_resolved_cat) > 0 THEN
        v_target_fp := v_resolved_cat || ':' || public.compute_risk_concept(v_resolved_text);

        UPDATE public.deal_risks
        SET
          status = 'resolved',
          resolved_call_id = p_conversation_id,
          updated_at = now()
        WHERE deal_id = p_deal_id
          AND status IN ('active', 'recurring')
          AND (
            fingerprint = v_target_fp
            OR (length(v_resolved_text) > 0 AND (
              lower(title) = lower(v_resolved_text)
              OR position(lower(v_resolved_text) in lower(title)) > 0
              OR position(lower(title) in lower(v_resolved_text)) > 0
            ))
          );
      END IF;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- 8) Append Grounded Evidence
  -- -------------------------------------------------------------------------
  IF p_conversation_id IS NOT NULL AND p_review->'supporting_evidence' IS NOT NULL THEN
    SELECT meeting_id INTO v_meeting_id FROM public.conversations WHERE id = p_conversation_id;

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
            trim(v_evidence_item #>> '{}'),
            NULL,
            NULL,
            'explicit_statement',
            80,
            now()
          );
        END IF;
      ELSIF jsonb_typeof(v_evidence_item) = 'object' THEN
        IF length(trim(COALESCE(v_evidence_item->>'quote', ''))) > 0 THEN
          INSERT INTO public.deal_evidence (
            deal_id,
            conversation_id,
            meeting_id,
            ai_inference_id,
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
            NULLIF(v_evidence_item->>'ai_inference_id', '')::uuid,
            trim(v_evidence_item->>'quote'),
            NULLIF(trim(COALESCE(v_evidence_item->>'speaker', '')), ''),
            NULLIF(trim(COALESCE(v_evidence_item->>'pillar_key', '')), ''),
            COALESCE(NULLIF(trim(COALESCE(v_evidence_item->>'grounding_type', '')), ''), 'explicit_statement'),
            COALESCE((v_evidence_item->>'confidence')::integer, 80),
            now()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- 9) Stakeholders Upsert
  -- -------------------------------------------------------------------------
  IF p_review->'stakeholder_signals' IS NOT NULL THEN
    FOR v_sig IN
      SELECT value FROM jsonb_array_elements(p_review->'stakeholder_signals')
    LOOP
      v_stakeholder_name := trim(COALESCE(v_sig->>'name', ''));
      IF length(v_stakeholder_name) > 0 THEN
        INSERT INTO public.stakeholders (
          deal_id,
          user_id,
          name,
          role,
          sentiment,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          p_deal_id,
          v_target_user,
          v_stakeholder_name,
          NULLIF(trim(COALESCE(v_sig->>'role', '')), ''),
          NULLIF(trim(COALESCE(v_sig->>'sentiment', '')), ''),
          COALESCE(v_sig->>'evidence', ''),
          now(),
          now()
        )
        ON CONFLICT (deal_id, name) DO UPDATE SET
          role = COALESCE(EXCLUDED.role, stakeholders.role),
          sentiment = COALESCE(EXCLUDED.sentiment, stakeholders.sentiment),
          notes = CASE
            WHEN EXCLUDED.notes IS NOT NULL AND length(EXCLUDED.notes) > 0 THEN EXCLUDED.notes
            ELSE stakeholders.notes
          END,
          updated_at = now();
      END IF;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- 10) Record Deal State Transitions
  -- -------------------------------------------------------------------------
  -- Transitions represent state changes from a previous reviewed call or prior state.
  -- For the FIRST reviewed call (no prior state or reviewed call), no transition is recorded.
  IF (v_prev_stage IS NOT NULL AND v_prev_stage IS DISTINCT FROM v_target_stage)
     OR (v_old_status IS NOT NULL AND v_old_status IS DISTINCT FROM v_status) THEN
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
      COALESCE(v_prev_stage, v_old_stage),
      v_target_stage,
      v_old_status,
      v_status,
      v_new_health - COALESCE(v_curr_health, v_new_health),
      COALESCE(p_review #>> '{deal,status_reason}', ''),
      now()
    );
  END IF;
END;
$$;

ALTER FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_deal_review(uuid, uuid, jsonb, text, uuid) TO service_role;
