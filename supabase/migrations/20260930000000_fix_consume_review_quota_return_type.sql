-- Fix consume_review_quota return type:
-- The Edge Function call-review checks for string responses ('not_allowed', 'quota_exceeded'),
-- but the initial implementation returned boolean, rendering quota and rate limit checks inactive.

DROP FUNCTION IF EXISTS public.consume_review_quota(uuid, integer);

CREATE OR REPLACE FUNCTION public.consume_review_quota(
  p_user_id uuid,
  p_max_reviews integer DEFAULT 20
)
RETURNS text
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
    RETURN 'not_allowed';
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
    RETURN 'not_allowed';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.review_usage_events e
  WHERE e.user_id = p_user_id
    AND e.created_at > now() - interval '24 hours';

  IF v_count >= GREATEST(p_max_reviews, 1) THEN
    RETURN 'quota_exceeded';
  END IF;

  INSERT INTO public.review_usage_events (user_id)
  VALUES (p_user_id);

  RETURN 'ok';
END;
$$;

ALTER FUNCTION public.consume_review_quota(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consume_review_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_review_quota(uuid, integer) TO service_role;
