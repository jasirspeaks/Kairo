-- Phase 3: Longitudinal Deal Memory & Grounded Evidence Model
-- 1. Create deal_evidence table for granular transcript-grounded evidence.
-- 2. Create deal_risks table for durable multi-call risk lifecycle tracking.
-- 3. Create deal_pillar_history table for chronological qualification transitions.
-- 4. Create deal_state_transitions table for deal stage/status history.
-- 5. Update persist_deal_review RPC to atomically maintain all longitudinal entities.

-- ---------------------------------------------------------------------------
-- 1) Grounded Evidence Ledger (deal_evidence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  quote text NOT NULL,
  speaker text,
  pillar_key text,
  grounding_type text NOT NULL DEFAULT 'explicit_statement',
  confidence integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_evidence_pillar_key_check
    CHECK (pillar_key IS NULL OR pillar_key IN ('compelling_event', 'economic_buyer', 'decision_process', 'budget', 'champion')),
  CONSTRAINT deal_evidence_grounding_type_check
    CHECK (grounding_type IN ('explicit_statement', 'behavioral_inference', 'structural_absence')),
  CONSTRAINT deal_evidence_confidence_check
    CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX IF NOT EXISTS deal_evidence_deal_id_idx ON public.deal_evidence (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_evidence_conversation_id_idx ON public.deal_evidence (conversation_id);

ALTER TABLE public.deal_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deal evidence" ON public.deal_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_evidence.deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.deal_evidence TO service_role;
GRANT ALL ON TABLE public.deal_evidence TO postgres;
GRANT SELECT ON TABLE public.deal_evidence TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Durable Deal Risks (deal_risks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title text NOT NULL,
  why_it_matters text,
  status text NOT NULL DEFAULT 'active',
  severity text NOT NULL DEFAULT 'high',
  first_identified_call_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  resolved_call_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  consecutive_unresolved_calls integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_risks_status_check
    CHECK (status IN ('active', 'mitigated', 'resolved', 'recurring')),
  CONSTRAINT deal_risks_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS deal_risks_deal_id_idx ON public.deal_risks (deal_id, status);

ALTER TABLE public.deal_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deal risks" ON public.deal_risks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_risks.deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.deal_risks TO service_role;
GRANT ALL ON TABLE public.deal_risks TO postgres;
GRANT SELECT ON TABLE public.deal_risks TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Deal Pillar History (deal_pillar_history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_pillar_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pillar_key text NOT NULL,
  status text NOT NULL,
  confidence integer NOT NULL DEFAULT 0,
  evidence_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_pillar_history_pillar_key_check
    CHECK (pillar_key IN ('compelling_event', 'economic_buyer', 'decision_process', 'budget', 'champion')),
  CONSTRAINT deal_pillar_history_status_check
    CHECK (status IN ('confirmed', 'partial', 'unconfirmed', 'not_yet_relevant')),
  CONSTRAINT deal_pillar_history_confidence_check
    CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX IF NOT EXISTS deal_pillar_history_deal_id_idx ON public.deal_pillar_history (deal_id, created_at DESC);

ALTER TABLE public.deal_pillar_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deal pillar history" ON public.deal_pillar_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_pillar_history.deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.deal_pillar_history TO service_role;
GRANT ALL ON TABLE public.deal_pillar_history TO postgres;
GRANT SELECT ON TABLE public.deal_pillar_history TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Deal State Transitions (deal_state_transitions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  from_stage text,
  to_stage text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  health_score_delta integer DEFAULT 0,
  transition_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_state_transitions_deal_id_idx ON public.deal_state_transitions (deal_id, created_at DESC);

ALTER TABLE public.deal_state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deal state transitions" ON public.deal_state_transitions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_state_transitions.deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

GRANT ALL ON TABLE public.deal_state_transitions TO service_role;
GRANT ALL ON TABLE public.deal_state_transitions TO postgres;
GRANT SELECT ON TABLE public.deal_state_transitions TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Atomic persist_deal_review RPC (Extended with Longitudinal Entities)
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
  v_resolved_risk text;
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

  -- 3) Maintain Durable Risks Ledger
  v_high_risk_title := NULLIF(trim(p_review #>> '{deal,highest_priority_risk,risk}'), '');
  v_high_risk_why := NULLIF(trim(p_review #>> '{deal,highest_priority_risk,why_it_matters}'), '');

  IF v_high_risk_title IS NOT NULL THEN
    INSERT INTO public.deal_risks (
      deal_id,
      title,
      why_it_matters,
      status,
      severity,
      first_identified_call_id,
      consecutive_unresolved_calls,
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
      now()
    );
  END IF;

  -- Mark resolved risks if delta provided
  IF p_review #> '{what_changed_since_last_call,resolved}' IS NOT NULL THEN
    FOR v_resolved_risk IN
      SELECT jsonb_array_elements_text(p_review #> '{what_changed_since_last_call,resolved}')
    LOOP
      UPDATE public.deal_risks
      SET
        status = 'resolved',
        resolved_call_id = p_conversation_id,
        updated_at = now()
      WHERE deal_id = p_deal_id
        AND status = 'active'
        AND lower(title) = lower(trim(v_resolved_risk));
    END LOOP;
  END IF;

  -- 4) Append Grounded Evidence
  IF p_conversation_id IS NOT NULL AND p_review->'supporting_evidence' IS NOT NULL THEN
    FOR v_evidence_item IN
      SELECT value FROM jsonb_array_elements(p_review->'supporting_evidence')
    LOOP
      IF length(trim(v_evidence_item #>> '{}')) > 0 THEN
        INSERT INTO public.deal_evidence (
          deal_id,
          conversation_id,
          quote,
          grounding_type,
          created_at
        )
        VALUES (
          p_deal_id,
          p_conversation_id,
          trim(v_evidence_item #>> '{}'),
          'explicit_statement',
          now()
        );
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
