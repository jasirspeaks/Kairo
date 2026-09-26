


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."conversation_input_type" AS ENUM (
    'audio',
    'transcript'
);


ALTER TYPE "public"."conversation_input_type" OWNER TO "postgres";


CREATE TYPE "public"."conversation_status" AS ENUM (
    'pending',
    'analyzing',
    'complete',
    'error'
);


ALTER TYPE "public"."conversation_status" OWNER TO "postgres";


CREATE TYPE "public"."deal_confidence" AS ENUM (
    'High',
    'Medium',
    'Low'
);


ALTER TYPE "public"."deal_confidence" OWNER TO "postgres";


CREATE TYPE "public"."deal_health_status" AS ENUM (
    'Healthy',
    'Open',
    'At Risk',
    'Lost Momentum'
);


ALTER TYPE "public"."deal_health_status" OWNER TO "postgres";


CREATE TYPE "public"."deal_pipeline_status" AS ENUM (
    'active',
    'stalled',
    'won',
    'lost'
);


ALTER TYPE "public"."deal_pipeline_status" OWNER TO "postgres";


CREATE TYPE "public"."risk_level" AS ENUM (
    'high',
    'medium',
    'low',
    'none'
);


ALTER TYPE "public"."risk_level" OWNER TO "postgres";


CREATE TYPE "public"."seller_role" AS ENUM (
    'founder',
    'ae',
    'consultant',
    'freelancer',
    'other'
);


ALTER TYPE "public"."seller_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, name, onboarding_complete)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    false
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status, trial_start, trial_end)
  values (
    new.id,
    'trialing',
    now(),
    now() + interval '14 days'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_write_access"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.status in ('trialing', 'active')
  );
$$;


ALTER FUNCTION "public"."has_write_access"("uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_write_access"("uid" "uuid") IS 'Gates INSERT-only RLS policies for trial/subscription enforcement. Only trialing (within window) and active (paid, current) can create new content. past_due, canceled, and expired are all read-only -- Stripe already retries failed payments before reporting past_due, so no additional grace period is applied here. Read access (SELECT) is never gated by this function.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."calendar_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "scope" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deal_id" "uuid",
    "title" "text",
    "input_type" "text" DEFAULT 'transcript'::"text" NOT NULL,
    "transcript" "text",
    "audio_url" "text",
    "analysis_json" "jsonb",
    "overall_score" integer,
    "sub_scores" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deal_stage" "text",
    "audio_deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_deal_stage_check" CHECK ((("deal_stage" IS NULL) OR ("deal_stage" = ANY (ARRAY['Qualification'::"text", 'Discovery'::"text", 'Demo'::"text", 'Evaluation'::"text", 'Alignment'::"text", 'Proposal'::"text", 'Negotiation'::"text", 'Procurement'::"text", 'Decision'::"text", 'Closed Won'::"text", 'Closed Lost'::"text"]))))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."audio_deleted_at" IS 'When the audio object in the recordings Storage bucket was deleted by the retention job. NULL means audio still exists (or input_type is not audio-based). Successful conversations: deleted 48h after status=complete. Failed/stuck conversations: deleted 7 days after last update.';



CREATE TABLE IF NOT EXISTS "public"."deal_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "current_status" "text",
    "confidence" "text",
    "highest_priority_risk" "text",
    "highest_priority_risk_full" "jsonb",
    "what_youre_missing" "jsonb",
    "key_follow_up_message" "text",
    "manager_note" "text",
    "supporting_evidence" "jsonb",
    "last_review_summary" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deal_health_score" integer,
    "pillars" "jsonb",
    CONSTRAINT "deal_state_current_status_check" CHECK ((("current_status" IS NULL) OR ("current_status" = ANY (ARRAY['Unknown'::"text", 'Healthy'::"text", 'Promising'::"text", 'At Risk'::"text", 'Critical'::"text", 'Stalled'::"text", 'Recovering'::"text", 'Won'::"text", 'Lost'::"text"])))),
    CONSTRAINT "deal_state_deal_health_score_check" CHECK ((("deal_health_score" >= 0) AND ("deal_health_score" <= 100)))
);


ALTER TABLE "public"."deal_state" OWNER TO "postgres";


COMMENT ON COLUMN "public"."deal_state"."pillars" IS 'Five-pillar qualification snapshot from the most recent call review. Shape: {compelling_event, economic_buyer, decision_process, budget, champion} each as {status: confirmed|partial|unconfirmed|not_yet_relevant, evidence: string}. Null until a deal is reviewed by a call-review version that emits this field (v22+). Additive to what_youre_missing, not a replacement.';



CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deal_name" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "risk_level" "text" DEFAULT 'none'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deal_stage" "text" DEFAULT 'Qualification'::"text" NOT NULL,
    "champion" "text",
    "deal_value" numeric,
    CONSTRAINT "deals_deal_stage_check" CHECK (("deal_stage" = ANY (ARRAY['Qualification'::"text", 'Discovery'::"text", 'Demo'::"text", 'Evaluation'::"text", 'Alignment'::"text", 'Proposal'::"text", 'Negotiation'::"text", 'Procurement'::"text", 'Decision'::"text", 'Closed Won'::"text", 'Closed Lost'::"text"])))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fireflies_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "encrypted_api_key" "text" NOT NULL,
    "webhook_secret" "text" NOT NULL,
    "fireflies_user_email" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_validated_at" timestamp with time zone,
    "last_webhook_received_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fireflies_connections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'invalid'::"text", 'disconnected'::"text"])))
);


ALTER TABLE "public"."fireflies_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'fireflies'::"text" NOT NULL,
    "external_id" "text",
    "title" "text",
    "transcript" "text" NOT NULL,
    "participants" "jsonb",
    "meeting_date" timestamp with time zone,
    "status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "matched_deal_id" "uuid",
    "matched_conversation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pending_calls_status_check" CHECK (("status" = ANY (ARRAY['unmatched'::"text", 'matched'::"text", 'discarded'::"text"])))
);


ALTER TABLE "public"."pending_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_schedule_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_schedule_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "what_you_sell" "text",
    "who_you_are" "text",
    "onboarding_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "calendar_event_id" "text" NOT NULL,
    "title" "text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "attendees" "jsonb",
    "status" "text" DEFAULT 'unassigned'::"text" NOT NULL,
    "deal_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "matched_conversation_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "meeting_link" "text",
    CONSTRAINT "scheduled_meetings_status_check" CHECK (("status" = ANY (ARRAY['unassigned'::"text", 'assigned'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."scheduled_meetings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."scheduled_meetings"."cancelled_at" IS 'Set when the source Google Calendar event was cancelled/deleted but the meeting was already assigned to a deal (so we keep the row for history/matching instead of deleting it). Null means not cancelled.';



COMMENT ON COLUMN "public"."scheduled_meetings"."meeting_link" IS 'The video conferencing link (Meet/Zoom/Teams/etc) detected on the source calendar event. Events without a meeting link are not synced into this table at all.';



CREATE TABLE IF NOT EXISTS "public"."stakeholders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text",
    "sentiment" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stakeholders_sentiment_check" CHECK ((("sentiment" IS NULL) OR ("sentiment" = ANY (ARRAY['champion'::"text", 'supporter'::"text", 'neutral'::"text", 'skeptic'::"text", 'blocker'::"text"]))))
);


ALTER TABLE "public"."stakeholders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_end" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."calendar_connections"
    ADD CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_connections"
    ADD CONSTRAINT "calendar_connections_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_state"
    ADD CONSTRAINT "deal_state_deal_id_key" UNIQUE ("deal_id");



ALTER TABLE ONLY "public"."deal_state"
    ADD CONSTRAINT "deal_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fireflies_connections"
    ADD CONSTRAINT "fireflies_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fireflies_connections"
    ADD CONSTRAINT "fireflies_connections_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."pending_calls"
    ADD CONSTRAINT "pending_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_schedule_intents"
    ADD CONSTRAINT "pending_schedule_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_meetings"
    ADD CONSTRAINT "scheduled_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_meetings"
    ADD CONSTRAINT "scheduled_meetings_user_id_calendar_event_id_key" UNIQUE ("user_id", "calendar_event_id");



ALTER TABLE ONLY "public"."stakeholders"
    ADD CONSTRAINT "stakeholders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "conversations_deal_id_idx" ON "public"."conversations" USING "btree" ("deal_id");



CREATE INDEX "conversations_user_id_idx" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "deal_state_user_id_idx" ON "public"."deal_state" USING "btree" ("user_id");



CREATE INDEX "deals_user_id_idx" ON "public"."deals" USING "btree" ("user_id");



CREATE INDEX "idx_fireflies_connections_user_id" ON "public"."fireflies_connections" USING "btree" ("user_id");



CREATE INDEX "pending_calls_matched_conversation_id_idx" ON "public"."pending_calls" USING "btree" ("matched_conversation_id");



CREATE INDEX "pending_calls_matched_deal_id_idx" ON "public"."pending_calls" USING "btree" ("matched_deal_id");



CREATE INDEX "pending_calls_user_status_idx" ON "public"."pending_calls" USING "btree" ("user_id", "status");



CREATE INDEX "pending_schedule_intents_created_at_idx" ON "public"."pending_schedule_intents" USING "btree" ("created_at");



CREATE INDEX "pending_schedule_intents_deal_id_idx" ON "public"."pending_schedule_intents" USING "btree" ("deal_id");



CREATE INDEX "pending_schedule_intents_user_id_idx" ON "public"."pending_schedule_intents" USING "btree" ("user_id");



CREATE INDEX "scheduled_meetings_deal_id_idx" ON "public"."scheduled_meetings" USING "btree" ("deal_id");



CREATE INDEX "scheduled_meetings_matched_conversation_id_idx" ON "public"."scheduled_meetings" USING "btree" ("matched_conversation_id");



CREATE INDEX "stakeholders_deal_id_idx" ON "public"."stakeholders" USING "btree" ("deal_id");



CREATE INDEX "stakeholders_user_id_idx" ON "public"."stakeholders" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."calendar_connections"
    ADD CONSTRAINT "calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_state"
    ADD CONSTRAINT "deal_state_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_state"
    ADD CONSTRAINT "deal_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fireflies_connections"
    ADD CONSTRAINT "fireflies_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_calls"
    ADD CONSTRAINT "pending_calls_matched_conversation_id_fkey" FOREIGN KEY ("matched_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_calls"
    ADD CONSTRAINT "pending_calls_matched_deal_id_fkey" FOREIGN KEY ("matched_deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_calls"
    ADD CONSTRAINT "pending_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_schedule_intents"
    ADD CONSTRAINT "pending_schedule_intents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_schedule_intents"
    ADD CONSTRAINT "pending_schedule_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_meetings"
    ADD CONSTRAINT "scheduled_meetings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_meetings"
    ADD CONSTRAINT "scheduled_meetings_matched_conversation_id_fkey" FOREIGN KEY ("matched_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_meetings"
    ADD CONSTRAINT "scheduled_meetings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stakeholders"
    ADD CONSTRAINT "stakeholders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stakeholders"
    ADD CONSTRAINT "stakeholders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete their own calendar connection" ON "public"."calendar_connections" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own schedule intents" ON "public"."pending_schedule_intents" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own calendar connection" ON "public"."calendar_connections" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own schedule intents" ON "public"."pending_schedule_intents" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."has_write_access"("user_id")));



CREATE POLICY "Users can update own pending calls" ON "public"."pending_calls" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own calendar connection" ON "public"."calendar_connections" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own scheduled meetings" ON "public"."scheduled_meetings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own pending calls" ON "public"."pending_calls" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own calendar connection" ON "public"."calendar_connections" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own schedule intents" ON "public"."pending_schedule_intents" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own scheduled meetings" ON "public"."scheduled_meetings" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own stakeholders" ON "public"."stakeholders" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."calendar_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete_own" ON "public"."conversations" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "conversations_insert_own" ON "public"."conversations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "conversations_select_own" ON "public"."conversations" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "conversations_update_own" ON "public"."conversations" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."deal_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deal_state_delete_own" ON "public"."deal_state" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "deal_state_insert_own" ON "public"."deal_state" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "deal_state_select_own" ON "public"."deal_state" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "deal_state_update_own" ON "public"."deal_state" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deals_delete_own" ON "public"."deals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "deals_insert_own" ON "public"."deals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "deals_select_own" ON "public"."deals" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "deals_update_own" ON "public"."deals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."fireflies_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fireflies_connections_delete_own" ON "public"."fireflies_connections" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "fireflies_connections_insert_own" ON "public"."fireflies_connections" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "fireflies_connections_select_own" ON "public"."fireflies_connections" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "fireflies_connections_update_own" ON "public"."fireflies_connections" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."pending_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_schedule_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."scheduled_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stakeholders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pending_calls";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."scheduled_meetings";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_write_access"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_write_access"("uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."calendar_connections" TO "anon";
GRANT ALL ON TABLE "public"."calendar_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_connections" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."deal_state" TO "anon";
GRANT ALL ON TABLE "public"."deal_state" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_state" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."fireflies_connections" TO "anon";
GRANT ALL ON TABLE "public"."fireflies_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."fireflies_connections" TO "service_role";



GRANT ALL ON TABLE "public"."pending_calls" TO "anon";
GRANT ALL ON TABLE "public"."pending_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_calls" TO "service_role";



GRANT ALL ON TABLE "public"."pending_schedule_intents" TO "anon";
GRANT ALL ON TABLE "public"."pending_schedule_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_schedule_intents" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_meetings" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."stakeholders" TO "anon";
GRANT ALL ON TABLE "public"."stakeholders" TO "authenticated";
GRANT ALL ON TABLE "public"."stakeholders" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































