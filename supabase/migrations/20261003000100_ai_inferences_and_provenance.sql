-- Phase 2: AI Inferences & Provenance Logging
-- Creates the ai_inferences audit ledger for reproducibility, model fallback tracking,
-- prompt versioning, and latency/token monitoring.

CREATE TABLE IF NOT EXISTS public.ai_inferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  model_id text NOT NULL,
  fallback_occurred boolean NOT NULL DEFAULT false,
  models_attempted jsonb DEFAULT '[]'::jsonb,
  prompt_version text NOT NULL,
  system_prompt_hash text,
  input_context_snapshot jsonb,
  raw_output_text text,
  parsed_output jsonb,
  latency_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_inferences_status_check CHECK (status IN ('success', 'failed', 'fallback'))
);

CREATE INDEX IF NOT EXISTS ai_inferences_deal_id_idx ON public.ai_inferences (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_inferences_user_id_idx ON public.ai_inferences (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_inferences_conversation_id_idx ON public.ai_inferences (conversation_id);

ALTER TABLE public.ai_inferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_inferences FROM anon;
REVOKE ALL ON TABLE public.ai_inferences FROM authenticated;
GRANT ALL ON TABLE public.ai_inferences TO service_role;
GRANT ALL ON TABLE public.ai_inferences TO postgres;

-- ---------------------------------------------------------------------------
-- Logging RPC for Edge Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ai_inference(
  p_user_id uuid,
  p_deal_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_model_id text DEFAULT 'unknown',
  p_fallback_occurred boolean DEFAULT false,
  p_models_attempted jsonb DEFAULT '[]'::jsonb,
  p_prompt_version text DEFAULT 'v2.1.0',
  p_system_prompt_hash text DEFAULT NULL,
  p_input_context_snapshot jsonb DEFAULT NULL,
  p_raw_output_text text DEFAULT NULL,
  p_parsed_output jsonb DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_error_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  v_role := (SELECT auth.role());
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.ai_inferences (
    user_id,
    deal_id,
    conversation_id,
    model_id,
    fallback_occurred,
    models_attempted,
    prompt_version,
    system_prompt_hash,
    input_context_snapshot,
    raw_output_text,
    parsed_output,
    latency_ms,
    status,
    error_message,
    created_at
  )
  VALUES (
    p_user_id,
    p_deal_id,
    p_conversation_id,
    p_model_id,
    p_fallback_occurred,
    p_models_attempted,
    p_prompt_version,
    p_system_prompt_hash,
    p_input_context_snapshot,
    p_raw_output_text,
    p_parsed_output,
    p_latency_ms,
    p_status,
    p_error_message,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.log_ai_inference OWNER TO postgres;
REVOKE ALL ON FUNCTION public.log_ai_inference FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_ai_inference TO service_role;
