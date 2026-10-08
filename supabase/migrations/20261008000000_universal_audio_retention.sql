-- Update conversations.audio_deleted_at documentation to reflect the universal 48-hour purge policy.
--
-- Policy:
--   Any audio object in the recordings Storage bucket older than 48 hours is purged
--   by audio-retention-job regardless of conversation completion status.
--   Automatic review retries complete within ~8 hours. Once transcribed, conversations
--   retain the transcript text in the database, making audio retention unnecessary.
--   Purging after 48h ensures data privacy and storage cost bounds.

COMMENT ON COLUMN public.conversations.audio_deleted_at IS
  'When the audio object in the recordings Storage bucket was deleted by the retention job. Any recording older than 48 hours is purged regardless of completion status; account deletion also removes them immediately.';
