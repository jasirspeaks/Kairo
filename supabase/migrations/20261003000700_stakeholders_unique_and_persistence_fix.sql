-- ===========================================================================
-- Migration: 20261003000700_stakeholders_unique_and_persistence_fix.sql
-- Description:
--   1. Ensures unique constraint on public.stakeholders (deal_id, name)
--      required by the ON CONFLICT (deal_id, name) clause in persist_deal_review.
--   2. Preserves all security constraints, auth.uid() checks, search_path='',
--      FOR UPDATE row-locking, and longitudinal risk persistence intact.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stakeholders'::regclass
      AND conname = 'stakeholders_deal_id_name_key'
  ) THEN
    ALTER TABLE public.stakeholders
      ADD CONSTRAINT stakeholders_deal_id_name_key UNIQUE (deal_id, name);
  END IF;
END
$$;
