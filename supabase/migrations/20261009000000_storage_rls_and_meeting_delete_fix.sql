-- Migration: 20261009000000_storage_rls_and_meeting_delete_fix.sql
-- Description:
-- 1. Ensure private 'recordings' storage bucket with strict user-isolated RLS policies on storage.objects.
-- 2. Relax meetings DELETE RLS policy so expired/canceled users can exercise Right to Erasure on meetings.
-- 3. Enhance public.get_calendar_connection_status() RPC to safely expose has_write_access and needs_reconnect without exposing OAuth tokens.

-- ============================================================================
-- 1. Recordings Storage Bucket & RLS Policies
-- ============================================================================

-- Ensure the private recordings bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Clean up any existing policies on storage.objects for the recordings bucket
DROP POLICY IF EXISTS "recordings_select_own" ON storage.objects;
DROP POLICY IF EXISTS "recordings_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "recordings_update_own" ON storage.objects;
DROP POLICY IF EXISTS "recordings_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read recordings in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload recordings to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update recordings in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete recordings in their own folder" ON storage.objects;

-- Strict least-privilege user isolation:
-- Storage path structure is {userId}/{dealId}/{conversationId}.{ext}
-- Users can ONLY access objects where the top-level folder matches auth.uid()
CREATE POLICY "recordings_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "recordings_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "recordings_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "recordings_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ============================================================================
-- 2. Relax Meetings DELETE Policy (Right to Erasure for Expired Users)
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own meetings" ON public.meetings;
CREATE POLICY "Users can delete own meetings" ON public.meetings
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- 3. Enhanced Calendar Connection Status RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_calendar_connection_status();

CREATE OR REPLACE FUNCTION public.get_calendar_connection_status()
RETURNS TABLE (
  connected boolean,
  provider text,
  has_write_access boolean,
  needs_reconnect boolean,
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
    (
      c.scope ILIKE '%calendar.events%'
      OR (c.scope ILIKE '%https://www.googleapis.com/auth/calendar%' AND c.scope NOT ILIKE '%calendar.readonly%')
    ) AS has_write_access,
    (
      c.needs_reconnect = true
      OR NOT (
        c.scope ILIKE '%calendar.events%'
        OR (c.scope ILIKE '%https://www.googleapis.com/auth/calendar%' AND c.scope NOT ILIKE '%calendar.readonly%')
      )
    ) AS needs_reconnect,
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
