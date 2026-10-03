-- Fix has_write_access to support service_role context and handle SQL null-safety
-- 1. When called under service_role / postgres, allow checking write access for the target user ID.
-- 2. When called under authenticated user, enforce that caller can only check their own user ID.
-- 3. Return boolean false instead of NULL when unauthorized.
-- 4. Grant execute permission to both authenticated and service_role.

CREATE OR REPLACE FUNCTION public.has_write_access(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(
      (
        COALESCE((SELECT auth.role()), current_user) IN ('service_role', 'postgres', 'supabase_admin')
        OR (
          (SELECT auth.uid()) IS NOT NULL
          AND uid = (SELECT auth.uid())
        )
      )
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
      ),
      false
    );
$$;

ALTER FUNCTION public.has_write_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_write_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_write_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_write_access(uuid) TO service_role;
