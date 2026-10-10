-- Migration: Enable Supabase Realtime for conversations and deal_state
-- Ensures that postgres_changes broadcasts fire for conversation reviews and state changes

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deal_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_state;
  END IF;
END $$;
