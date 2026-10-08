# Kairo Legal & Privacy Technical Audit v2

**Document Version:** 2.0.0  
**Audit Date:** October 8, 2026  
**Auditor:** Implementation, Security & Privacy Audit Engineer  
**Scope:** Complete Kairo Monorepo (`apps/web`, `apps/desktop`, `apps/mobile`, `packages/api`, `packages/core`, `packages/platform`, `supabase/*`)  
**Basis:** Strictly verified against the current repository source code, database migrations, configuration files, and edge runtime functions. No external assumptions or unverified promises.

---

## 1. Executive Summary

This document is an independent, technical-only audit of the current data protection, security, privacy, and architectural posture of Kairo. It serves as the authoritative technical baseline required before drafting or publishing public-facing legal documents (Privacy Policy, Terms of Service, Data Processing Addenda, and Subprocessor Disclosures).

### Key Takeaways
1. **Zero Tracking / Marketing Telemetry Confirmed:** Kairo contains **zero** commercial tracking scripts, marketing pixels, behavioral analytics SDKs (no PostHog, Mixpanel, Segment, Datadog, Sentry, or Google Analytics), and issues **zero** first-party cookies.
2. **Audio Retention Divergence Detected:** The codebase was recently modified (commit `560d410`, migration `20261008000000`) to enforce a **universal 48-hour purge** on all audio files in Supabase Storage older than 48 hours, regardless of whether processing succeeded or failed. This conflicts with the founder's previous operating assumption that failed recordings would remain until review succeeds.
3. **Local Desktop Capture Audio Persistence Gap:** In the desktop application (`apps/desktop`), native WASAPI loopback audio is captured and written to `%TEMP%\kairo_captures\kairo_meeting_<id>_<ts>.wav`. When capture completes and is uploaded, **the local WAV file is never deleted from the local disk**, resulting in unencrypted sales meeting recordings remaining indefinitely on the user's computer.
4. **Google Files API Audio Deletion Gap:** For audio files larger than 18 MB, `mobile-recording-review` uploads the audio payload to the Google Generative Language Files API (`https://generativelanguage.googleapis.com/upload/v1beta/files`). Kairo **never sends an explicit deletion call** (`DELETE /v1beta/{fileName}`) after transcription completes, relying entirely on Google's default 48-hour unmanaged retention policy.
5. **Storage Bucket RLS Configuration Untracked:** Supabase Storage bucket `recordings` RLS policies are **absent from version-controlled database migrations**. Code cannot verify whether the bucket is private or public on Supabase Cloud, nor whether authenticated users could craft signed or direct URLs to access other tenants' recordings.
6. **Account Deletion Extent:** Account deletion via `delete-account` completely purges all PostgreSQL tenant data via cascading foreign keys (`ON DELETE CASCADE`), issues a best-effort revoke of Google Calendar OAuth tokens, and wipes the user's folder in Supabase Storage. However, **it does not cancel or delete active Stripe subscriptions/customers**, nor does it purge unmanaged Google Gemini Files API uploads.

---

## 2. Current System Architecture

Kairo is a multi-client deal intelligence platform composed of:
- **Web Client (`apps/web`):** React 19 SPA bundled with Vite, hosted on Vercel. Communicates with Supabase via `@kairo/api`.
- **Desktop Client (`apps/desktop`):** Tauri 2.0 wrapper around React 19 with a native Rust backend (`apps/desktop/src-tauri`). Performs system audio capture via Windows WASAPI loopback (`windows_loopback.rs`) and microphone capture via CPAL (`capture.rs`).
- **Mobile Client (`apps/mobile`):** Expo 52 / React Native 0.76 application. Captures microphone audio via `expo-av`, manages local audio files via `expo-file-system`, and persists auth tokens via `@react-native-async-storage/async-storage`.
- **Shared Libraries (`packages/*`):**
  - `@kairo/core`: Types, deal normalization, stage progression logic, risk models.
  - `@kairo/api`: Supabase JS wrapper, conversations service, deals service, hooks.
  - `@kairo/platform`: Audio recording hooks, Tauri IPC bridge, storage adapters.
- **Backend / Database (`supabase/*`):**
  - PostgreSQL database with Row Level Security (RLS) on all user-facing tables.
  - 10 Deno Edge Functions handling AI review orchestration, background retries, calendar sync, billing, and account deletion.
  - `pg_cron` background jobs for audio retention and subscription trial expiration.

---

## 3. Personal Data Inventory

The following table categorizes all direct and indirect personal data collected or handled by Kairo:

| Data Category | Specific Data Elements | Collection Point / Source | Storage Location | Processing Purpose | Third-Party Exposure |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Account Credentials** | Email address, password hash, session JWTs | `/signup`, `/signin`, Google OAuth | `auth.users`, client `localStorage` (Web/Desktop) / `AsyncStorage` (Mobile) | Identity verification, session authentication | Supabase Auth |
| **User Profile** | Full name, role (`who_you_are`), value proposition (`what_you_sell`) | `/onboarding`, `/app/settings` | `public.profiles` (`name`, `who_you_are`, `what_you_sell`) | In-app user display, injected as seller context into LLM prompts | Google Gemini (via prompt context), Supabase |
| **Buyer / Prospect Personal Data** | Full name, professional role/title, buyer sentiment, personal notes | Inferred by LLM from call audio/transcripts, or manually entered | `public.stakeholders` (`name`, `role`, `sentiment`, `notes`) | Deal qualification, stakeholder relationship mapping | Google Gemini (during transcript analysis), Supabase |
| **Voice / Biometrics** | Human voice audio recordings | In-browser mic, mobile mic (`expo-av`), desktop mic & WASAPI loopback | Supabase Storage (`recordings` bucket), client local disk (`%TEMP%`), Google Files API | Speech-to-text verbatim transcription | Google Gemini (audio payload), Supabase Storage |
| **Calendar & Attendee Data** | Attendee email addresses, display names, meeting titles, conference links, event timestamps | Google Calendar v3 API via OAuth token | `public.meetings` (`attendees` JSONB array, `title`, `start_time`, `end_time`, `meeting_link`), `public.calendar_connections` | Meeting synchronization, automated deal matching, Google Meet creation | Google Cloud API, Supabase |
| **Billing Identity** | Stripe Customer ID (`cus_...`), Stripe Subscription ID (`sub_...`), billing status, period end dates | Stripe Checkout redirect, Stripe Webhooks | `public.subscriptions` | Feature gating, trial enforcement, subscription lifecycle | Stripe, Inc., Supabase |
| **Network & Device Metadata** | Client IP address, User-Agent header, device OS info (in desktop captures / updater) | HTTP transport headers, Cloudflare Turnstile, GitHub Releases API | Edge runtime ephemeral memory, Cloudflare edge, GitHub CDN | Abuse prevention, edge routing, desktop app update checks | Cloudflare (Turnstile), GitHub (updater), Supabase / Vercel edge |

---

## 4. Customer / Business Confidential Data Inventory

The core value proposition of Kairo involves ingesting highly sensitive B2B commercial intelligence:

| Confidential Data Element | Source | Storage Location | Sensitivity & Impact | Exposure Beyond Tenant |
| :--- | :--- | :--- | :--- | :--- |
| **Deal Commercial Details** | Deal name, target company name, deal stage, deal value, status (`active`, `won`, `lost`) | User input or inferred by LLM | `public.deals`, `public.deal_state`, `public.deal_state_transitions` | **High:** Reveals sales pipeline size, active prospects, pricing models, and close dates. | Google Gemini (prompt payload), Supabase DB |
| **Sales Call Audio Recordings** | Live meetings, recorded discovery calls, product demos | Supabase Storage (`recordings/{user_id}/{deal_id}/{conversation_id}.ext`), desktop temp directory | **Critical:** Unedited conversations between buyers and sellers containing confidential roadmap discussions, trade secrets, budget numbers, and commercial objections. | Supabase Storage, Google Gemini API / Files API, local desktop file system |
| **Verbatim Transcripts** | Speech-to-text transcription of sales calls | `public.conversations` (`transcript`), `public.ai_inferences` (`input_context_snapshot`) | **Critical:** Full text transcript of sales meetings, customer complaints, internal processes, and pricing discussions. | Supabase DB, Google Gemini API |
| **Deal Risks & Missing Gaps** | Specific vulnerabilities identified by AI (e.g., "Economic buyer not involved", "Budget unallocated") | Generated by Google Gemini | `public.deal_risks` (`title`, `why_it_matters`, `severity`), `public.deal_state` (`what_youre_missing`) | **High:** Proprietary sales weaknesses and risk postures. | Supabase DB |
| **Direct Buyer Quotes & Evidence** | Granular transcript quotes anchoring deal qualification pillars | Extracted by Gemini LLM | `public.deal_evidence` (`quote`, `speaker`, `pillar_key`, `grounding_type`) | **High:** Exact verbatim statements from enterprise buyers. | Supabase DB |
| **OAuth Access & Refresh Tokens** | Google OAuth authorization code exchange | `public.calendar_connections` (`access_token`, `refresh_token`, `token_expires_at`) | **Critical:** Stored in plaintext in PostgreSQL; grants access to read/write the user's primary Google Calendar events. | Supabase DB |

---

## 5. Data Flow Map

```mermaid
flowchart TD
    subgraph Clients["Kairo Clients"]
        Web["Web SPA (Browser)"]
        Desk["Desktop App (Tauri / WASAPI)"]
        Mob["Mobile App (Expo / React Native)"]
    end

    subgraph Supabase["Supabase Cloud Infrastructure"]
        Auth["Supabase Auth (auth.users)"]
        DB["PostgreSQL (public.*)"]
        Storage["Storage ('recordings' bucket)"]
        MRR["Edge Function: mobile-recording-review"]
        CR["Edge Function: call-review"]
        CronRet["pg_cron: audio-retention-job"]
        CronExp["pg_cron: expire-trials-job"]
        DelAcc["Edge Function: delete-account"]
    end

    subgraph External["External Subprocessors"]
        GeminiInference["Google Gemini API (generateContent)"]
        GeminiFiles["Google Gemini Files API (/upload/v1beta/files)"]
        GCal["Google Calendar API (v3)"]
        StripeAPI["Stripe, Inc. (Checkout & Portal)"]
        GH["GitHub Releases API (Desktop Updater)"]
        CF["Cloudflare Turnstile (Bot Check)"]
    end

    %% Client data flows
    Web -->|Auth & Session| Auth
    Mob -->|Auth & Session| Auth
    Desk -->|Auth & Session| Auth

    Web -->|Raw Audio Upload| Storage
    Desk -->|Raw Audio Upload| Storage
    Mob -->|Raw Audio Upload| Storage

    Web -->|Write-Ahead Transcript & Deal Metadata| DB
    Desk -->|Meeting Metadata| DB
    Mob -->|Profile Updates| DB

    %% Processing flows
    Storage -->|Download Audio Bytes| MRR
    MRR -->|Audio < 18MB (inline base64)| GeminiInference
    MRR -->|Audio >= 18MB (raw binary)| GeminiFiles
    GeminiFiles -->|File URI Reference| GeminiInference
    GeminiInference -->|Verbatim Transcript| MRR

    MRR -->|Internal RPC: user_id + transcript + deal context| CR
    CR -->|System Prompt + Longitudinal History + Transcript| GeminiInference
    GeminiInference -->|Structured JSON Extraction| CR
    CR -->|Persist Review RPC| DB

    %% Google Calendar flows
    Web & Mob -->|Initiate OAuth| GCal
    GCal -->|Tokens & Event Sync| DB

    %% Billing flows
    Web & Mob -->|Redirect to Checkout| StripeAPI
    StripeAPI -->|Webhook Event| DB

    %% Retention & Cleanup
    CronRet -->|Purge Audio > 48h| Storage
    CronExp -->|Mark Trials Expired| DB
    DelAcc -->|Revoke Tokens| GCal
    DelAcc -->|Wipe Folder| Storage
    DelAcc -->|admin.deleteUser (Cascade)| DB
```

---

## 6. Database & RLS Audit

### Inspected Tables & RLS Status
All database tables in `public` schema have Row Level Security enabled (`ENABLE ROW LEVEL SECURITY`).

| Table Name | Defined In Migration | RLS Enabled? | Direct Client Access | Cascades on `auth.users` Delete? | Cascades on `deals` Delete? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `profiles` | `20260926203528_remote_schema.sql` | Yes | SELECT, UPDATE (own row) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | N/A |
| `deals` | `20260926203528_remote_schema.sql` | Yes | SELECT, INSERT, UPDATE, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | Self |
| `conversations` | `20260926203528_remote_schema.sql` | Yes | SELECT, INSERT, UPDATE, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `deal_state` | `20260926203528_remote_schema.sql` | Yes | SELECT, INSERT, UPDATE, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `stakeholders` | `20260926203528_remote_schema.sql` | Yes | SELECT, INSERT, UPDATE, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `meetings` | `20261003000300_evolve_meetings_domain_model.sql` | Yes | SELECT, INSERT, UPDATE, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | No (`ON DELETE SET NULL`) |
| `calendar_connections` | `20260926203528_remote_schema.sql` | Yes | SELECT (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | N/A |
| `subscriptions` | `20260926203528_remote_schema.sql` | Yes | SELECT (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | N/A |
| `review_usage_events`| `20260929140000_security_and_integrity_hardening.sql` | Yes | SELECT (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | N/A |
| `ai_inferences` | `20261003000100_ai_inferences_and_provenance.sql` | Yes | **Revoked from client; service-role only** | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `deal_evidence` | `20261003000200_longitudinal_memory_and_evidence.sql` | Yes | SELECT (own rows via deal ownership check) | Yes (via `deals` cascade) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `deal_risks` | `20261003000200_longitudinal_memory_and_evidence.sql` | Yes | SELECT (own rows via deal ownership check) | Yes (via `deals` cascade) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `deal_pillar_history`| `20261003000200_longitudinal_memory_and_evidence.sql` | Yes | SELECT (own rows via deal ownership check) | Yes (via `deals` cascade) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `deal_state_transitions` | `20261003000200_longitudinal_memory_and_evidence.sql`| Yes | SELECT (own rows via deal ownership check) | Yes (via `deals` cascade) | Yes (`REFERENCES deals ON DELETE CASCADE`) |
| `pending_schedule_intents` | `20260926203528_remote_schema.sql` | Yes | SELECT, INSERT, DELETE (own rows) | Yes (`REFERENCES auth.users ON DELETE CASCADE`) | N/A |

### RLS Vulnerability Analysis
1. **Cross-Tenant IDOR Protection:** Every table requires `(SELECT auth.uid()) = user_id` for SELECT, UPDATE, and DELETE. For relational child tables (`conversations`, `stakeholders`, `deal_evidence`, `deal_risks`), policies explicitly verify that the referenced `deal_id` belongs to `(SELECT auth.uid())` via `EXISTS (SELECT 1 FROM public.deals WHERE deals.id = deal_id AND deals.user_id = auth.uid())`. This prevents an attacker from associating conversations or stakeholders with another user's deal.
2. **Expired User Deletion Asymmetry:**
   - In migration `20260930000100_relax_delete_rls_policies.sql`, DELETE policies on `deals`, `conversations`, `deal_state`, and `stakeholders` were relaxed to allow users to delete their own records even if their subscription or trial has expired (`trial_end < now()`).
   - However, in `20261003000300_evolve_meetings_domain_model.sql` (lines 158-163), the DELETE policy for `meetings` was written as:
     ```sql
     CREATE POLICY "Users can delete own meetings" ON public.meetings
       FOR DELETE TO authenticated
       USING ((SELECT auth.uid()) = user_id AND (SELECT public.has_write_access((SELECT auth.uid()))));
     ```
     **Impact:** Once a user's trial or subscription expires, they **cannot delete their own synced meetings** directly from the UI, creating an asymmetry with GDPR/DPDP deletion rights.
3. **Database Storage Object Policies Untracked:** Supabase Storage policies for the `recordings` bucket do not exist in any migration file. If storage permissions rely on dashboard-only settings, local development reproductions and fresh CI/CD environments may default to unprotected storage permissions.

---

## 7. Audio & Recording Lifecycle

### Complete Audio Lifecycle Trace
1. **Capture:**
   - **Web:** Captured via browser `navigator.mediaDevices.getUserMedia` and `MediaRecorder` (`packages/platform/src/audio/useAudioRecorder.ts`). Audio recorded into memory chunks (`Blob[]`).
   - **Desktop:** Native Windows loopback audio captured via WASAPI (`apps/desktop/src-tauri/src/windows_loopback.rs`) and microphone audio captured via CPAL (`apps/desktop/src-tauri/src/capture.rs`). Mixed at 16kHz mono and written to disk at `%TEMP%\kairo_captures\kairo_meeting_<meeting_id>_<timestamp>.wav`.
   - **Mobile:** Captured via Expo AV `Audio.Recording` (`apps/mobile/src/screens/RecordScreen.tsx`). Saved to app cache via `expo-file-system`.
2. **Upload:**
   - Audio is uploaded directly from the client to Supabase Storage bucket `recordings` at:
     ```
     {user_id}/{deal_id}/{conversation_id}.{m4a|aac|webm|wav|ogg}
     ```
   - Client records storage path in `public.conversations.audio_url`.
3. **Processing / Transcription:**
   - Edge function `mobile-recording-review` is invoked.
   - Using `SUPABASE_SERVICE_ROLE_KEY`, it downloads the audio binary from Storage.
   - If audio size < 18 MB (`INLINE_LIMIT_BYTES`), audio is base64 encoded and sent inline in the JSON payload of `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`.
   - If audio size >= 18 MB, audio is uploaded via `POST https://generativelanguage.googleapis.com/upload/v1beta/files`. The returned `file_uri` is passed to Gemini `generateContent`.
4. **Post-Transcription Persistence:**
   - The returned verbatim transcript is immediately persisted to `public.conversations.transcript`.
5. **Scheduled Deletion (Retention Job):**
   - Edge function `audio-retention-job` is triggered on a schedule via `pg_cron` (authenticated via `x-retention-job-secret`).
   - Queries `conversations` where `audio_url IS NOT NULL`, `audio_deleted_at IS NULL`, and `created_at < now() - interval '48 hours'`.
   - Deletes the object from Supabase Storage via `supabase.storage.from('recordings').remove([row.audio_url])`.
   - Stamps `public.conversations.audio_deleted_at = now()`.

### Retention Discrepancies & Gaps
1. **Universal Purge vs. Stuck Review Retries:**
   - Prior code only purged audio for conversations with `status = 'complete'`.
   - Commit `560d410` modified `audio-retention-job/index.ts` (lines 62-70) to purge **all** audio older than 48 hours regardless of conversation status (`complete`, `failed`, `retry_pending`).
   - **Consequence:** If a call review encounters persistent infrastructure failures and remains in `retry_pending` past 48 hours, the underlying audio file is permanently deleted from Storage. Subsequent retries will fail with `"Recording unavailable"` because the audio was wiped.
2. **Orphaned Desktop Local Files:**
   - On Windows, the desktop app creates files in `%TEMP%\kairo_captures\*.wav`.
   - When the user stops recording and the file is uploaded, `useMeetingCapture.ts` reads the bytes into memory, but **never commands the native backend to delete the temporary WAV file**.
   - The WAV files remain on the end-user's filesystem indefinitely unless manually cleared or wiped by the operating system's temp cleaner.
3. **Google Files API Audio Retention:**
   - Files uploaded to `https://generativelanguage.googleapis.com/upload/v1beta/files` are never deleted by Kairo.
   - Google automatically purges Files API uploads after 48 hours, but Kairo has no programmatic guarantee or early deletion hook (`DELETE /v1beta/{file_name}`).

---

## 8. Transcript & Conversation Lifecycle

1. **Storage of Raw Transcripts:**
   - Verbatim transcripts are stored in `public.conversations.transcript` (`text` column).
   - Once generated, **transcripts are retained indefinitely** in the database while the deal or account exists. Transcripts are **not** purged by `audio-retention-job`.
2. **AI Inference Snapshots:**
   - In `supabase/functions/call-review/index.ts` (lines 1333-1353), every successful review invokes RPC `log_ai_inference`, which inserts a record into `public.ai_inferences`.
   - This record stores the full raw model output (`raw_output_text`) and parsed JSON (`parsed_output`).
3. **Failed Reviews:**
   - In the event of a review failure, if speech-to-text transcription succeeded, the generated transcript remains saved in `public.conversations.transcript`. On retry, `mobile-recording-review` reuses the existing transcript rather than re-transcribing the audio.
4. **Transcript Deletion:**
   - If a user deletes a deal, all associated conversation rows cascade delete (`ON DELETE CASCADE`).
   - If a user deletes a conversation, the conversation row is deleted. However, the corresponding record in `public.ai_inferences` has `conversation_id REFERENCES public.conversations(id) ON DELETE SET NULL`. Therefore, the AI provenance record (containing extracted intelligence quotes and deal metrics) **remains in `public.ai_inferences` until the deal or account is deleted**.
   - If an account is deleted, all conversations and all `ai_inferences` rows cascade delete.

---

## 9. AI / Gemini Data Flow

### Provider Verification
- **Provider:** Google Cloud / Google Generative AI (Google AI Studio API / Generative Language API).
- **Authentication:** Single API Key (`GEMINI_API_KEY`) passed via query parameter `?key=${GEMINI_API_KEY}`.
- **Service Type:** Uses `https://generativelanguage.googleapis.com` endpoints. Does **not** use Google Cloud Vertex AI (which requires GCP IAM service account authentication, customer-managed encryption keys, and enterprise zero-data-retention guarantees).
- **Model Fallback Chain:**
  1. `gemini-3.8-flash` (Primary)
  2. `gemini-3.7-flash` (First fallback)
  3. `gemini-3.6-flash` (Second fallback)
  *(Configurable via `GEMINI_MODEL` environment variable override).*

### Data Transferred to Google Gemini
1. **Audio Transcription:**
   - Audio binary sent either as base64 string inline or raw binary to Google Files API.
   - Prompt: `"Transcribe this sales call audio verbatim. Label speakers as Rep: and Prospect: where you can distinguish them..."`
2. **Deal Intelligence Review:**
   - Prompt payload includes:
     - Target deal name and prospect company name (`deal_context.deal_name`, `deal_context.company_name`).
     - Current deal stage on record.
     - Seller context: Seller role (`who_you_are`) and product summary (`what_you_sell`).
     - Longitudinal memory: Past call dates, past call stages, past call statuses, verdicts; active risk ledger (risk title, why it matters, severity); cumulative pillar scores; known buyer network (stakeholder names, roles, sentiment).
     - Verbatim transcript of the meeting.

### Provider-Side Storage and Retention Status
- **Inference Requests (`generateContent`):** Under standard Google AI Studio / Gemini API Developer terms, whether Google logs or retains customer prompts depends on whether the API key is tied to a paid Google Cloud project or a free tier API key.
- **Code Reality:** The codebase contains **no configuration flags, headers, or parameters** asserting HIPAA, zero-retention, or DPA terms to Google.
- **Files API Uploads:** Audio uploaded via `upload/v1beta/files` is stored on Google infrastructure for up to 48 hours before automated purge.

---

## 10. Google OAuth & Calendar Audit

### Requested Scopes
In `supabase/functions/google-calendar-connect/index.ts` (lines 354-355), Kairo requests:
```
scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
```

### Scope Necessity Analysis
- `https://www.googleapis.com/auth/calendar.events`: Grants full read and write access to all events on all calendars accessible to the user. This is used by `schedule-meeting` to create events with Google Meet links, and by `google-calendar-sync` to list events.
- `https://www.googleapis.com/auth/calendar.readonly`: Grants read-only access to all calendars and calendar metadata.
- **Over-Permission Finding:** `calendar.events` already includes all read permissions for events. Requesting `calendar.readonly` concurrently is redundant and prompts users with broader permissions than necessary. If Kairo only needs to insert meetings and read primary events, it should evaluate whether more restricted scopes are feasible.

### Token Storage & Security
- `access_token` and `refresh_token` are stored in plaintext in the `public.calendar_connections` table.
- They are protected by RLS (only service role or the owning user can access the table). However, **tokens are not encrypted at rest at the application/column level** (e.g., using `pgsodium` or AES-GCM). A database backup leak or administrative database compromise would expose valid Google OAuth refresh tokens.

### Disconnection & Revocation
- When a user disconnects their calendar in Settings (`DELETE /functions/v1/google-calendar-connect`):
  1. Fetches `refresh_token` or `access_token`.
  2. Calls `POST https://oauth2.googleapis.com/revoke` with `token=<token>`.
  3. Deletes the database row in `calendar_connections`.
- When an account is deleted (`delete-account`):
  1. Issues token revocation to `https://oauth2.googleapis.com/revoke`.
  2. Cascades deletion of the database record.

---

## 11. Billing / Stripe Audit

### Stripe Architecture
- **Integration Type:** Stripe Checkout and Stripe Customer Portal via Stripe SDK (`stripe@14.25.0`).
- **Client Handling of Card Data:** **Zero.** No credit card numbers, CVVs, expiration dates, or bank details ever touch Kairo client code or Supabase servers. All payment entry occurs hosted on Stripe domains (`checkout.stripe.com`).
- **Stored Identifiers:**
  - `public.subscriptions.stripe_customer_id` (`cus_...`)
  - `public.subscriptions.stripe_subscription_id` (`sub_...`)
  - `public.subscriptions.status` (`active`, `trialing`, `past_due`, `canceled`, `expired`)
  - `public.subscriptions.current_period_end`
  - `public.subscriptions.trial_end`
- **Webhook Verification:**
  - `supabase/functions/stripe-webhook/index.ts` constructs and verifies events using `stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)`.
  - Unsigned or invalid webhook calls are rejected with HTTP 400.
- **Account Deletion Gap:**
  - When a user deletes their Kairo account via `delete-account`, the `subscriptions` row in PostgreSQL is deleted via foreign key cascade.
  - **However, `delete-account` does not call `stripe.subscriptions.cancel()` or `stripe.customers.del()`.**
  - **Impact:** An active paying subscriber who deletes their account in Kairo will **continue to be billed by Stripe** unless the subscription is canceled in Stripe prior to deletion!

---

## 12. Analytics / Cookies / Tracking Audit

- **Third-Party Analytics:** **None.** Comprehensive scan across all packages and HTML headers confirmed zero third-party tracking scripts (No Google Analytics, PostHog, Mixpanel, Segment, Hotjar, Sentry, or Datadog).
- **Cookies:** **None.** Kairo sets no HTTP cookies (`document.cookie` is unused).
- **Client Storage Usage:**
  - `localStorage.kairo-sidebar-collapsed`: Boolean UI preference for sidebar state (`apps/web`).
  - `localStorage.sb-<project>-auth-token`: Supabase session JWT and refresh token (standard Supabase JS SDK storage).
  - Mobile: `@react-native-async-storage/async-storage` for Supabase session persistence.
- **Consent Banners:** Because Kairo uses zero tracking cookies and zero behavioral trackers, a traditional ePrivacy / GDPR cookie consent banner is **not technically required** for tracking, though informational disclosure regarding essential local storage is best practice.

---

## 13. Third-Party / Subprocessor Inventory

| Provider | Location / Entity | Purpose | Data Received | Known Retention | Deletion Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Supabase, Inc.** | USA | Database, Auth, Storage, Edge Functions host | Email, password hash, user profile, all deal data, transcripts, audio recordings, Google tokens | Retained until deleted by user or retention job | DB cascade on account delete; Storage folder wipe via `delete-account` |
| **Google Cloud / Google Generative AI** | USA | Speech-to-text audio transcription, deal evaluation | Voice audio files, meeting transcripts, deal names, company names, seller context | 48 hours for Files API uploads; inference retention subject to Google AI Studio API tier terms | Files API: auto-purged after 48h; Inference: unmanaged by Kairo |
| **Google Cloud (Google Calendar API)** | USA | Meeting sync, Google Meet scheduling | User calendar metadata, event titles, attendee emails, meeting links | Maintained in Google Calendar according to user's Google account settings | Revocation of OAuth token via `oauth2.googleapis.com/revoke` on disconnect or account delete |
| **Stripe, Inc.** | USA | Payment processing, checkout, customer portal | User email, Stripe Customer ID, payment method details (entered directly on Stripe) | Maintained according to Stripe statutory tax and accounting retention rules | **Manual only**; Kairo does not cancel subscriptions upon account deletion |
| **Cloudflare, Inc.** | USA | Bot protection (Turnstile captcha widget) | Client IP address, browser fingerprint, solve challenge token | Ephemeral (token expires within minutes) | Managed by Cloudflare edge |
| **Vercel, Inc.** | USA | Web frontend hosting | Client IP addresses, HTTP request logs | Standard web server access logs (typically 30-90 days) | Managed by Vercel edge |
| **GitHub, Inc.** | USA | Desktop updater release endpoint check | Client IP address, User-Agent, version query | Ephemeral HTTP request logs | Managed by GitHub edge |

---

## 14. Retention Matrix

| Data Category | Created When | Stored Where | Automatic Deletion | User Deletion | Deal Deletion | Account Deletion | Current Risk / Technical Gap |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **User Account & Email** | Sign up | `auth.users`, `public.profiles` | None | None | None | Permanently deleted via `admin.deleteUser` | Complete cascade. |
| **Active Deal Data** | User creates deal or AI infers deal | `public.deals`, `public.deal_state`, `public.deal_state_transitions` | None | Deleted in UI | Self | Permanently deleted via FK cascade | Retained indefinitely until user deletion. No inactivity timeout. |
| **Audio Recordings (Cloud)** | Audio recorded on Web, Desktop, or Mobile | Supabase Storage `recordings` bucket | **Purged after 48 hours** by `audio-retention-job` regardless of status | None in UI | Audio NOT deleted on manual deal delete | Wiped by `delete-account` | Deleting a deal does not delete orphaned audio file in Storage! |
| **Audio Recordings (Desktop Local)** | Desktop native recording | Local disk `%TEMP%\kairo_captures\*.wav` | None | None | None | None | **Files remain unencrypted on user's hard drive indefinitely.** |
| **Google Files API Audio** | Audio >= 18 MB uploaded for transcription | Google Files API (`upload/v1beta/files`) | Google auto-purge after 48h | None | None | None | **No explicit DELETE API call issued by Kairo.** |
| **Transcripts** | Transcribed by AI or pasted by user | `public.conversations.transcript` | None | Deleted with conversation | Deleted with deal | Permanently deleted via FK cascade | Retained indefinitely in DB. |
| **AI Provenance Logs** | Call review executed | `public.ai_inferences` | None | None | Deleted with deal | Permanently deleted via FK cascade | Deleting conversation sets `conversation_id = NULL`; row remains linked to deal. |
| **Meetings & Calendar Events** | Synced from Google or scheduled | `public.meetings` | None | Deleted in UI (active subs only) | `deal_id` set to NULL | Permanently deleted via FK cascade | Expired users cannot delete meetings client-side due to RLS check. |
| **OAuth Tokens** | Google Calendar connected | `public.calendar_connections` | None | Revoked and deleted on disconnect | None | Revoked and deleted on account delete | Stored in plaintext in PostgreSQL database. |
| **Stripe Billing Data** | User checks out | `public.subscriptions` | None | None | None | DB row deleted; **Stripe subscription remains active** | **User continues to be billed by Stripe after account deletion.** |

---

## 15. Account Deletion Audit

### End-to-End Deletion Trace (`supabase/functions/delete-account/index.ts`)
1. **Authentication:**
   - User session verified via `supabase.auth.getUser(token)`.
   - Requires explicit body confirmation: `confirm_email` matching authenticated user email.
2. **Calendar OAuth Revocation:**
   - Retrieves `refresh_token` or `access_token` from `calendar_connections`.
   - Calls `POST https://oauth2.googleapis.com/revoke` (best-effort, non-blocking on failure).
3. **Storage Audio Wipe:**
   - Calls `wipeRecordingsFolder(supabase, userId)`.
   - Lists all deal folders under `recordings/{userId}` and calls `storage.from('recordings').remove(...)`.
4. **Database Cascade Deletion:**
   - Calls `supabase.auth.admin.deleteUser(userId)`.
   - Cascades automatically through all foreign keys referencing `auth.users(id) ON DELETE CASCADE`:
     - `public.profiles`
     - `public.deals` -> cascades to `conversations`, `deal_state`, `stakeholders`, `deal_evidence`, `deal_risks`, `deal_pillar_history`, `deal_state_transitions`, `ai_inferences`
     - `public.meetings`
     - `public.calendar_connections`
     - `public.subscriptions`
     - `public.review_usage_events`
     - `public.pending_schedule_intents`

### Deletion Status Breakdown
- **Confirmed Deleted Server-Side:** Auth account, profiles, deals, conversations, transcripts, database evidence/risks, calendar connection rows, storage recordings folder.
- **Confirmed NOT Deleted / Critical Gaps:**
  1. **Stripe Subscriptions:** Stripe Customer and active recurring subscriptions are **not canceled**.
  2. **Google Files API Uploads:** Audio uploaded to Google Files API is **not explicitly deleted**.
  3. **Local Desktop Temp Files:** Native WAV files on user machines are **not wiped**.
  4. **Client Local Storage:** Client must call `signOut()` and purge local storage on their browser/device.

---

## 16. Security & Access-Control Findings

### Service-Role Key Usage
Edge functions use `SUPABASE_SERVICE_ROLE_KEY` to perform administrative database operations and bypass RLS where appropriate:
- `audio-retention-job`: Uses service role to query and delete across all tenant folders. Guarded by `x-retention-job-secret`.
- `expire-trials-job`: Uses service role to transition expired trials. Guarded by `x-expire-trials-job-secret`.
- `retry-call-reviews`: Uses service role to claim and process retries. Guarded by `x-retry-call-reviews-job-secret`.
- `call-review` & `mobile-recording-review`: Verify caller JWT before performing work; allow service-role callers for internal orchestrations.

### IDOR & Authorization Verification
1. **RPC Authorization:**
   - `persist_deal_review`: Strictly verifies that `deal_id` belongs to `p_user_id`.
   - `claim_conversation_review`: Strictly verifies `user_id` ownership before marking status `processing`.
   - `consume_review_quota`: Strictly scoped to caller `p_user_id`.
2. **Storage Orphan Risk on Deal Deletion:**
   - When a user deletes a deal in the UI, the `deals` row is deleted, which cascades to delete the `conversations` row.
   - **However, Supabase Storage does not have database foreign key triggers.**
   - If a deal is deleted while an audio file is in Storage, the `conversations` row is gone. The `audio-retention-job` queries `public.conversations` to find files to delete. Because the conversation row no longer exists, **orphaned audio files may linger in Storage until the user deletes their entire account**!

---

## 17. Mobile / Desktop / Web Privacy Audit

### Web Client
- Uses standard browser `MediaRecorder` API. Prompts for microphone access via browser dialog.
- Stores session in `localStorage`.
- Zero tracking scripts or third-party cookies.
- `/privacy` route exists and displays a placeholder disclosure stating the policy is under preparation.

### Desktop Client (Tauri 2.0 / Windows)
- **Permissions:** Does not require OS-level permission dialogs on Windows for loopback capture, but WASAPI loopback captures all desktop audio across all applications (Slack, Spotify, Zoom, private notifications) if played during recording!
- **Local Cache:** Writes uncompressed 16kHz WAV files to `%TEMP%\kairo_captures\*.wav`. Files are not deleted after upload.
- **Tauri Security:** `tauri.conf.json` specifies `"security": { "csp": null }`. Content Security Policy is disabled.
- **Arbitrary File Read Command:** Tauri command `read_capture_bytes(file_path: String)` reads any file path provided by the frontend without verifying that the path resides within `kairo_captures`. Combined with `csp: null`, this presents a local security risk if malicious script execution were achieved.

### Mobile Client (Expo / React Native)
- **Permissions:** Prompts for microphone permission (`Audio.requestPermissionsAsync()`).
- **Temporary Files:** Creates audio files via `expo-av` and `expo-file-system`. Explicitly deletes local files immediately upon upload completion or failure.
- **Credential Storage:** Uses `@react-native-async-storage/async-storage` for Supabase auth session tokens. This storage is unencrypted on device storage.
- **Account Deletion:** Implemented in `SettingsScreen.tsx`, invoking `delete-account` edge function with email confirmation.

---

## 18. Privacy Documentation Readiness

| Document / Requirement | Present in Codebase? | Current Status / Readiness |
| :--- | :--- | :--- |
| **Privacy Policy** | Placeholder Only | `/privacy` route exists on web, but renders placeholder: *"Policy Document in Preparation"*. |
| **Terms of Service** | Absent | No `/terms` route or terms agreement in signup flow. |
| **Cookie Policy** | Absent | Technically not required as zero tracking cookies exist, but local storage disclosure is recommended. |
| **Data Deletion Policy** | Absent | Deletion mechanics exist in code, but no documented SLA or policy for users. |
| **Recording / Consent Notice** | Minimal UI notice | UI states recording is active, but lacks a formal two-party consent warning informing sellers of wiretap / recording consent laws. |
| **Subprocessor List** | Absent | No public documentation disclosing Supabase, Google, Stripe, Cloudflare, Vercel, and GitHub. |
| **DPA / Enterprise Terms** | Absent | No standard Data Processing Addendum available for B2B customers. |

---

## 19. Changes Since Previous Audit

The previous audit artifact (`docs/legal/privacy-data-inventory.md`) documented the system state as of earlier today. The following architectural and behavioral changes were identified since then:

| Feature / Area | Previous Documented Behavior | Current Actual Behavior | Privacy / Security Impact | Technical & Doc Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **Audio Retention Policy** | Completed audio deleted after 48h; failed audio retained until successful retry or account delete. | **Universal 48-hour purge** (commit `560d410`, migration `20261008000000`). All audio older than 48h is deleted regardless of completion status. | Failed calls will lose audio after 48h, making late retries impossible. Guarantees upper bound on storage privacy. | Founder must decide whether to keep universal 48h purge or restore retry exemption with a hard cap (e.g. 14 days). |
| **Call Review Orchestration** | Text transcripts were analyzed directly via synchronous `call-review` HTTP call from client. | **Write-Ahead Persistence & Background Worker** (`39e5f82`, `bda45fe`, `9658618`). Text transcripts are saved to DB immediately with `status = 'pending'`, then processed via `mobile-recording-review` background worker. | User input is durably persisted prior to review. Failed reviews retain transcript in DB. | Document write-ahead persistence in data flow disclosures. |
| **Orphaned Job Recovery** | Pending jobs could stall if the client crashed during network dispatch. | Migration `20261008010000`: `claim_call_review_retry` automatically sweeps conversations stuck in `pending` for > 2 minutes into `retry_pending`. | Guarantees eventual processing or terminal failure without user re-intervention. | Document that review processing is durable and resilient. |
| **AI Model Upgrades** | Model fallback chain started with `gemini-3.7-flash`. | Model chain upgraded to prioritize `gemini-3.8-flash` (`call-review`, `mobile-recording-review`). | Data sent to newest Gemini model series. | Update subprocessor documentation with verified model IDs. |
| **Public Privacy Route** | No privacy route existed on web app (404). | Public route `/privacy` created (`apps/web/src/pages/legal/PrivacyPolicy.tsx`), linked from `SignIn`, `SignUp`, `Settings`, and `UpgradeModal`. | Frontend infrastructure ready to display approved policy. | Draft and inject approved legal policy text. |

---

## 20. Findings & Risk Levels

### CRITICAL

#### Finding C-01: Active Stripe Subscriptions Survive Account Deletion
- **Evidence:** `supabase/functions/delete-account/index.ts` lines 189-208. The function wipes Storage, revokes Google OAuth, and deletes `auth.users`, but makes **zero calls to the Stripe API**.
- **Why it matters:** A paying customer who deletes their Kairo account expecting all data and billing to terminate will continue to be charged monthly by Stripe. This will lead to payment disputes, chargebacks, and legal liability.
- **Current behavior:** Stripe Customer and Subscriptions remain active on Stripe indefinitely after Kairo account deletion.
- **Recommended technical action:** In `delete-account/index.ts`, query `subscriptions` for `stripe_subscription_id` and call `stripe.subscriptions.cancel(subId)` prior to deleting the user record.
- **Legal/documentation implication:** The Privacy Policy and Terms of Service must state whether canceling in Kairo immediately cancels Stripe billing.
- **Status:** OPEN.

#### Finding C-02: Local Desktop Recording Files Persist Indefinitely on Disk
- **Evidence:** `apps/desktop/src-tauri/src/capture.rs` lines 479-485 and `packages/platform/src/audio/useMeetingCapture.ts` lines 98-135. Recordings saved to `%TEMP%\kairo_captures\*.wav`. `stopCapture()` reads the bytes and uploads them, but never deletes the file.
- **Why it matters:** Sales meetings frequently discuss trade secrets, customer PII, unreleased features, and financial figures. Storing unencrypted WAV files in a user's temporary folder indefinitely creates a data leakage vulnerability on lost or shared laptops.
- **Current behavior:** Audio files accumulate unencrypted on the user's hard drive.
- **Recommended technical action:** Add a Tauri command `delete_capture_file(file_path: String)` and invoke it in `useMeetingCapture.ts` immediately after successful upload.
- **Legal/documentation implication:** Violates promises of ephemeral audio handling if files remain on customer hardware.
- **Status:** OPEN.

---

### HIGH

#### Finding H-01: Storage Bucket RLS Policies Not Managed in Migrations
- **Evidence:** Search for `storage.objects` across `supabase/migrations/` returns 0 results.
- **Why it matters:** If the `recordings` bucket is misconfigured in Supabase Cloud or created without object-level RLS policies, authenticated users could manipulate object paths and read other tenants' audio recordings.
- **Current behavior:** Storage bucket security relies entirely on cloud dashboard configuration rather than version-controlled code.
- **Recommended technical action:** Create a Supabase migration explicitly defining RLS policies on `storage.objects` ensuring `(SELECT auth.uid())::text = (storage.foldername(name))[1]`.
- **Legal/documentation implication:** Necessary to support technical security representations in a Security Whitepaper or DPA.
- **Status:** OPEN.

#### Finding H-02: Google Files API Audio Uploads Are Not Explicitly Deleted
- **Evidence:** `supabase/functions/mobile-recording-review/index.ts` lines 140-251. Files are uploaded via `upload/v1beta/files`, transcribed, but `DELETE /v1beta/{fileName}` is never called.
- **Why it matters:** Although Google documentation states files expire after 48 hours, relying on third-party passive expiry without issuing an active delete upon completion leaves sensitive customer audio accessible via file URI longer than necessary.
- **Current behavior:** Audio remains on Google servers until Google's internal 48-hour garbage collector runs.
- **Recommended technical action:** In `mobile-recording-review/index.ts`, add a `finally` block or post-transcription step calling `fetch("https://generativelanguage.googleapis.com/v1beta/" + fileName + "?key=" + GEMINI_API_KEY, { method: "DELETE" })`.
- **Legal/documentation implication:** Policy must disclose whether audio is actively deleted or passively expired at third-party AI subprocessors.
- **Status:** OPEN.

#### Finding H-03: Plaintext Storage of Google OAuth Tokens
- **Evidence:** `supabase/migrations/20260926203528_remote_schema.sql` and `supabase/functions/google-calendar-callback/index.ts` line 345. `access_token` and `refresh_token` stored as plain `text`.
- **Why it matters:** In the event of a database compromise or backup leak, full read/write Google Calendar refresh tokens would be exposed.
- **Current behavior:** Tokens stored in plaintext in PostgreSQL.
- **Recommended technical action:** Encrypt tokens at rest using Supabase Vault or `pgsodium` before inserting into `calendar_connections`.
- **Legal/documentation implication:** Standard enterprise security questionnaires ask if OAuth tokens are encrypted at rest.
- **Status:** OPEN.

---

### MEDIUM

#### Finding M-01: Expired Subscription Users Cannot Delete Their Own Meetings
- **Evidence:** `supabase/migrations/20261003000300_evolve_meetings_domain_model.sql` lines 158-163. DELETE policy for `meetings` requires `has_write_access((SELECT auth.uid()))`.
- **Why it matters:** Under GDPR and DPDP, data subjects have the right to erase their personal data regardless of whether their commercial subscription is active or expired.
- **Current behavior:** A user whose trial has expired cannot delete meetings from their account.
- **Recommended technical action:** Relax the DELETE policy on `meetings` to `USING ((SELECT auth.uid()) = user_id)` (matching the relaxation done for deals and conversations in `20260930000100`).
- **Legal/documentation implication:** Direct contradiction of user erasure rights if unsubscribed users cannot delete their meeting history.
- **Status:** OPEN.

#### Finding M-02: Orphaned Storage Audio When Deal is Deleted Manually
- **Evidence:** Deleting a deal in `packages/api/src/services/deals.ts` deletes the `deals` row. Foreign keys cascade delete the `conversations` row. Storage files are not deleted.
- **Why it matters:** If a deal is deleted within 48 hours of creation, the database record is wiped. When `audio-retention-job` runs, it queries `conversations` to locate files; since the row is gone, the file in Storage is never identified and lingers until account deletion.
- **Current behavior:** Storage objects become orphaned when deals are deleted.
- **Recommended technical action:** When deleting a deal or conversation, trigger a storage deletion for all associated `audio_url` values.
- **Legal/documentation implication:** Data retention policy cannot claim audio is wiped when the customer deletes the deal.
- **Status:** OPEN.

#### Finding M-03: Redundant Google OAuth Scope Requested
- **Evidence:** `supabase/functions/google-calendar-connect/index.ts` lines 354-355 requests both `calendar.events` and `calendar.readonly`.
- **Why it matters:** Google OAuth App Verification scrutinizes requested scopes. Requesting redundant scopes increases verification difficulty and raises user suspicion during consent screens.
- **Current behavior:** Both scopes requested simultaneously.
- **Recommended technical action:** Remove `https://www.googleapis.com/auth/calendar.readonly` since `calendar.events` provides full read and write access.
- **Legal/documentation implication:** Google OAuth verification submission requires explaining why each scope is necessary.
- **Status:** OPEN.

#### Finding M-04: Desktop Client Has Disabled CSP and Unrestricted File Read
- **Evidence:** `apps/desktop/src-tauri/tauri.conf.json` (`security.csp: null`) and `apps/desktop/src-tauri/src/commands.rs` (`read_capture_bytes`).
- **Why it matters:** `read_capture_bytes` takes an arbitrary path string and reads file bytes without path sandboxing. If an XSS vulnerability occurs in the desktop webview, an attacker could read arbitrary local files.
- **Current behavior:** File reads accept any path on the system; CSP is disabled.
- **Recommended technical action:** Restrict `read_capture_bytes` to only allow paths within `std::env::temp_dir().join("kairo_captures")`, and define a strict Content Security Policy in `tauri.conf.json`.
- **Legal/documentation implication:** Affects security representations in SOC2 / enterprise evaluations.
- **Status:** OPEN.

---

### LOW

#### Finding L-01: AI Provenance Logs Retain Conversation Snapshots After Conversation Delete
- **Evidence:** `supabase/migrations/20261003000100_ai_inferences_and_provenance.sql` line 9. `conversation_id` has `ON DELETE SET NULL`.
- **Why it matters:** If a user deletes an individual conversation, the underlying AI prompt output and input context snapshot remain stored in `public.ai_inferences` until the whole deal is deleted.
- **Current behavior:** Granular conversation deletion leaves inference history in the database.
- **Recommended technical action:** Evaluate whether `ai_inferences` should cascade delete on conversation deletion, or if provenance audit ledgers should be explicitly documented as retained per-deal.
- **Legal/documentation implication:** Document the distinction between operational conversation deletion and audit log retention.
- **Status:** OPEN.

#### Finding L-02: Mobile Session Tokens in Unencrypted AsyncStorage
- **Evidence:** `apps/mobile/src/initAuth.ts` uses `@react-native-async-storage/async-storage`.
- **Why it matters:** On rooted Android devices or unencrypted backups, AsyncStorage can be read by local utilities.
- **Current behavior:** Supabase JWT session stored in standard AsyncStorage.
- **Recommended technical action:** Migrate mobile auth storage to `expo-secure-store` / Keychain / Keystore.
- **Legal/documentation implication:** Relevant for mobile security assessment in enterprise environments.
- **Status:** OPEN.

---

### INFO

#### Finding I-01: Cloudflare Turnstile Inactive by Default
- **Evidence:** `apps/web/src/components/auth/Captcha.tsx` lines 27-29. Turnstile widget is a no-op unless `VITE_TURNSTILE_SITE_KEY` is defined.
- **Why it matters:** Without the key configured, signup/signin forms have no client-side CAPTCHA or bot protection.
- **Current behavior:** No-op in default builds.
- **Recommended technical action:** Configure Turnstile site key and enable native Turnstile verification in Supabase Auth dashboard prior to general launch.
- **Status:** INFO.

#### Finding I-02: Desktop Background Updater Queries GitHub Releases
- **Evidence:** `apps/desktop/src-tauri/tauri.conf.json` lines 49-53. Queries `https://github.com/jasirspeaks/Kairo/releases/latest/download/latest.json`.
- **Why it matters:** The desktop app periodically sends client IP and User-Agent to GitHub CDN to check for updates.
- **Current behavior:** Queries public GitHub releases.
- **Recommended technical action:** Document GitHub as an infrastructure provider for desktop update distribution.
- **Status:** INFO.

---

## 21. Founder Decisions Required

The following decisions require explicit determination by the founder (Jasir) and cannot be unilaterally assumed by engineering:

| Decision Item | Context & Technical Facts | Options for Founder |
| :--- | :--- | :--- |
| **1. Audio Retention on Failed / Incomplete Reviews** | Commit `560d410` enforced a universal 48h purge on all audio older than 48h regardless of review completion. This means failed reviews lose their audio after 48 hours. | **Option A (Current Code):** Maintain universal 48h purge for all audio (clean privacy guarantee, but failed calls cannot be re-transcribed after 48h).<br>**Option B:** Exclude failed/incomplete calls from 48h purge, but add a hard upper cap (e.g. 14 days or 30 days) after which failed audio is deleted regardless. |
| **2. Inactive Deal & Transcript Retention Policy** | Active deal records, verbatim transcripts, and stakeholder intelligence are stored indefinitely until deleted by the user. | **Option A:** Indefinite retention until user/account deletion (standard for B2B CRM tools).<br>**Option B:** Introduce automated archival or deletion for inactive accounts (e.g. 12 or 24 months of dormancy). |
| **3. Commercial Model Training Guarantees with Google** | Kairo uses Google AI Studio endpoints (`generativelanguage.googleapis.com`). Standard developer terms differ from Google Cloud Vertex AI enterprise zero-data-retention terms. | **Option A:** Upgrade to Google Cloud Vertex AI with a signed Business Associate Agreement (BAA) / Enterprise Zero Data Retention commitment.<br>**Option B:** Clearly disclose in Privacy Policy that AI processing is governed by Google Generative AI terms and confirm whether customer data is excluded from model training. |
| **4. Legal Entity Name, Jurisdiction & Contact** | Official privacy documents must specify the legal operating company and contact address. | Founder must provide: Legal Entity Name, Registration Jurisdiction, Registered Address, and official privacy contact email (e.g. `privacy@kairo.com`). |
| **5. Two-Party Recording Consent Policy** | Kairo records live sales conversations. In several jurisdictions (e.g. California, Germany), recording requires the consent of all parties on the call. | Founder must decide whether Kairo provides in-app disclosure banners advising sellers to notify prospects before starting recordings. |

---

## 22. Recommended Next Steps

### Phase 1: Immediate Technical Fixes (Engineering)
1. **Fix Stripe Cancellation on Account Deletion:** Update `delete-account/index.ts` to cancel active Stripe subscriptions before deleting `auth.users`.
2. **Delete Local Desktop Audio on Upload:** Add a Tauri command in `capture.rs` to delete `%TEMP%\kairo_captures\*.wav` files once uploaded.
3. **Explicit Google Files API Deletion:** Add an immediate `DELETE` request in `mobile-recording-review` after transcription completes.
4. **Fix Expired User Meeting Deletion:** Relax the DELETE RLS policy on `public.meetings` so users can delete their meeting data even after trial expiration.
5. **Version-Control Storage RLS:** Write and commit migration for `storage.objects` RLS policies.
6. **Remove Redundant Scope:** Remove `calendar.readonly` from `google-calendar-connect`.

### Phase 2: Founder Alignment & Policy Drafting (Founder + Counsel)
1. Confirm decisions on Audio Retention Cap and Google Enterprise terms.
2. Supply legal entity name and jurisdiction.
3. Draft production Privacy Policy, Terms of Service, and Subprocessor Disclosure based on the validated technical truth established in this audit.
4. Publish final text to `/privacy` and `/terms`.
