-- Phase 1: Meeting Domain Model & Database Evolution
-- 1. Safely evolve scheduled_meetings into public.meetings with expanded schema.
-- 2. Add columns for native capture, source tracking, conversation binding, and device metadata.
-- 3. Create backward-compatible view public.scheduled_meetings.
-- 4. Add meeting_id foreign keys to conversations and deal_evidence.
-- 5. Add needs_reconnect and calendar_id to calendar_connections.
-- 6. Setup RLS policies, indexes, and realtime publication.

DO $$
BEGIN
  -- Rename table if scheduled_meetings exists and meetings does not
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scheduled_meetings' AND table_type = 'BASE TABLE'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meetings'
  ) THEN
    ALTER TABLE public.scheduled_meetings RENAME TO meetings;
  END IF;
END $$;

-- If meetings table does not exist (e.g. fresh environment), create it
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id text,
  title text NOT NULL DEFAULT 'Untitled Meeting',
  start_time timestamptz,
  end_time timestamptz,
  attendees jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled',
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  matched_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  meeting_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Make calendar_event_id nullable (for native or ad-hoc meetings prior to Google sync)
ALTER TABLE public.meetings ALTER COLUMN calendar_event_id DROP NOT NULL;

-- Add new columns for native capture & domain model
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'google_calendar',
  ADD COLUMN IF NOT EXISTS capture_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS audio_storage_path text,
  ADD COLUMN IF NOT EXISTS capture_device_info jsonb;

-- Update constraints
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS scheduled_meetings_status_check;
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_status_check
    CHECK (status IN ('unassigned', 'assigned', 'scheduled', 'completed', 'cancelled'));

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_source_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_source_check
    CHECK (source IN ('kairo_native', 'google_calendar', 'ad_hoc'));

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_capture_status_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_capture_status_check
    CHECK (capture_status IN ('idle', 'approaching', 'recording', 'uploading', 'processing', 'completed', 'failed', 'discarded'));

-- Add meeting_id to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_meeting_id_idx
  ON public.conversations(meeting_id);

-- Add meeting_id to deal_evidence
ALTER TABLE public.deal_evidence
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deal_evidence_meeting_id_idx
  ON public.deal_evidence(meeting_id);

-- Add needs_reconnect & calendar_id to calendar_connections
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS needs_reconnect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_id text NOT NULL DEFAULT 'primary';

-- Indexes on meetings
CREATE INDEX IF NOT EXISTS meetings_user_id_start_time_idx
  ON public.meetings (user_id, start_time ASC);

CREATE INDEX IF NOT EXISTS meetings_deal_id_idx
  ON public.meetings (deal_id);

CREATE INDEX IF NOT EXISTS meetings_conversation_id_idx
  ON public.meetings (conversation_id);

CREATE INDEX IF NOT EXISTS meetings_active_capture_idx
  ON public.meetings (user_id, capture_status)
  WHERE capture_status IN ('approaching', 'recording', 'uploading', 'processing');

CREATE INDEX IF NOT EXISTS meetings_calendar_event_id_idx
  ON public.meetings (user_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Clean up any old policies
DROP POLICY IF EXISTS "Users can view their own scheduled meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can update their own scheduled meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can insert own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can update own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can delete own meetings" ON public.meetings;

-- RLS Policies for meetings
CREATE POLICY "Users can view own meetings" ON public.meetings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own meetings" ON public.meetings
  FOR INSERT TO authenticated
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

CREATE POLICY "Users can update own meetings" ON public.meetings
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

CREATE POLICY "Users can delete own meetings" ON public.meetings
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
  );

-- Permissions
GRANT ALL ON TABLE public.meetings TO service_role;
GRANT ALL ON TABLE public.meetings TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meetings TO authenticated;

-- Backward-compatible view for existing queries
CREATE OR REPLACE VIEW public.scheduled_meetings AS
  SELECT * FROM public.meetings;

GRANT ALL ON TABLE public.scheduled_meetings TO service_role;
GRANT ALL ON TABLE public.scheduled_meetings TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduled_meetings TO authenticated;

-- Realtime publication
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
