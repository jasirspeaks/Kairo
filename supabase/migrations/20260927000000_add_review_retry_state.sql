-- Durable review retry state.
--
-- The conversation row already owns the source material (transcript/audio)
-- and the resulting analysis. These columns let the review pipeline retry
-- Gemini work without losing the material or requiring user intervention.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS review_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_last_error text,
  ADD COLUMN IF NOT EXISTS review_retryable boolean NOT NULL DEFAULT false;

-- Only retryable conversations need to be discovered by the worker.
-- The partial index keeps the retry scan small as the conversations table grows.
CREATE INDEX IF NOT EXISTS conversations_review_retry_idx
  ON public.conversations (review_next_attempt_at)
  WHERE review_retryable = true
    AND review_next_attempt_at IS NOT NULL;