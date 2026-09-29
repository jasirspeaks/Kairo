-- Migration: Remove Fireflies integration completely
-- Drops Fireflies connection and webhook event tables, helper RPCs, and resets default source on pending_calls.

DROP TABLE IF EXISTS public.fireflies_connections CASCADE;
DROP TABLE IF EXISTS public.fireflies_webhook_events CASCADE;

DROP FUNCTION IF EXISTS public.claim_fireflies_webhook(uuid, text);
DROP FUNCTION IF EXISTS public.finish_fireflies_webhook(uuid, uuid);
DROP FUNCTION IF EXISTS public.fail_fireflies_webhook(uuid, text);

ALTER TABLE public.pending_calls ALTER COLUMN source SET DEFAULT 'manual';
