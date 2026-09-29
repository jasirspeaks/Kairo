import type { CSSProperties } from 'react';
import { supabase } from './supabase';
import { DealReview, DealStatus, CallStatus, DealStage, DEAL_STAGES, DEAL_STATUS_COLORS, CALL_STATUS_COLORS } from '../types';

interface SellerContext {
  what_you_sell?: string;
  who_you_are?: string;
}

interface DealContext {
  deal_name: string;
  company_name: string;
  deal_stage?: string;
  previous_review?: DealReview | null;
  seller_context?: SellerContext;
}

export async function reviewCall(
  transcript: string,
  deal_context?: DealContext
): Promise<DealReview> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to review a call.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/call-review`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        transcript,
        deal_context,
        seller_context: deal_context?.seller_context,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Call review failed. Please try again.');
  }

  return data.review as DealReview;
}

export async function saveDealState(
  dealId: string,
  userId: string,
  review: DealReview,
  resolvedStage?: DealStage
): Promise<void> {
  let stage = resolvedStage;

  if (!stage) {
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('deal_stage')
      .eq('id', dealId)
      .eq('user_id', userId)
      .maybeSingle();

    if (dealError) {
      throw new Error(`Failed to read deal stage: ${dealError.message}`);
    }
    if (!deal) {
      throw new Error('Deal not found.');
    }

    stage = resolveDealStage(deal.deal_stage, review);
  }

  const { error } = await supabase.rpc('persist_deal_review', {
    p_deal_id: dealId,
    p_user_id: userId,
    p_review: review,
    p_resolved_stage: stage,
  });

  if (error) {
    throw new Error(`Failed to persist deal review: ${error.message}`);
  }
}

// Kept as a compatibility shim for existing call sites. Stakeholders are now
// persisted by persist_deal_review() in the same database transaction as
// deal_state/deals, so this must not issue a second independent write.
export async function saveStakeholders(
  _dealId: string,
  _userId: string,
  _review: DealReview
): Promise<void> {
  return;
}

// Returns the exact hex code for a Call Status (On Track, Needs Attention, At Risk, Stalled).
export function getCallStatusColor(status: string): string {
  return CALL_STATUS_COLORS[status as CallStatus] || DEAL_STATUS_COLORS.Unknown;
}

// Returns an inline style object for a call status badge/pill.
export function getCallStatusStyle(status: string): CSSProperties {
  const color = getCallStatusColor(status);
  return {
    color,
    backgroundColor: `${color}1A`, // ~10% opacity fill
    borderColor: `${color}4D`,     // ~30% opacity border
  };
}

// Returns the exact Blueprint hex code for a Deal Status (or Call Status), for inline styles
// (badges, risk-dots, chart legends) where a Tailwind utility class can't
// express the precise color.
export function getStatusColor(status: string): string {
  if (status in CALL_STATUS_COLORS) {
    return CALL_STATUS_COLORS[status as CallStatus];
  }
  return DEAL_STATUS_COLORS[status as DealStatus] || DEAL_STATUS_COLORS.Unknown;
}

// Returns an inline style object for a status badge/pill. Tailwind can't
// express 9 arbitrary hex values via static className switches, so badges
// use this directly: <span style={getStatusStyle(status)}>...</span>
export function getStatusStyle(status: string): CSSProperties {
  const color = getStatusColor(status);
  return {
    color,
    backgroundColor: `${color}1A`, // ~10% opacity fill
    borderColor: `${color}4D`,     // ~30% opacity border
  };
}

export function getRiskLevel(status: string): 'high' | 'medium' | 'low' | 'none' {
  switch (status as DealStatus) {
    case 'Critical':
    case 'At Risk':
      return 'high';
    case 'Stalled':
    case 'Recovering':
      return 'medium';
    case 'Healthy':
    case 'Promising':
    case 'Won':
      return 'low';
    case 'Lost':
    case 'Unknown':
    default:
      return 'none';
  }
}

// Deal Stage is no longer user-selected anywhere in the app -- it's set
// entirely from what call-review concretely observed happened in the deal's
// calls (deal.suggested_deal_stage), via this function. Called after every
// successful review, right alongside saveDealState/saveStakeholders.
//
// DUPLICATE LOGIC WARNING: mirrored server-side by
// resolveDealStageServer() in supabase/functions/_shared/deal-writeback.ts,
// used by the Fireflies webhook and mobile-recording-review paths (which
// run in Deno and can't import this file). Keep the advance-only /
// regression-override logic identical in both places -- see that file's
// own comment for the reasoning this mirrors.
//
// Rules, in order:
//   1. An explicit Won/Lost call always promotes to the matching Closed
//      stage, regardless of anything else -- this was already true before
//      stage inference existed and is unchanged.
//   2. A rare, explicit stage_regression_override lets the AI move the
//      deal backward from its current stage, when it found unambiguous
//      evidence of a genuine requalification (see the prompt for the bar
//      this has to clear). This is the ONLY path that can move a deal
//      stage backward.
//   3. Otherwise, the deal can only advance or hold: suggested_deal_stage
//      is applied only if it sits at or after the deal's current stage in
//      DEAL_STAGES order. A suggestion that's actually behind the current
//      stage (model noise, a quieter call, stale context) is silently
//      ignored rather than applied -- the current stage stands.
//   4. If suggested_deal_stage is absent entirely (a review produced
//      before this feature shipped, or normalization somehow omitted it),
//      the current stage stands untouched -- this function never
//      invents a stage from nothing.
export function resolveDealStage(currentStage: DealStage, review: DealReview): DealStage {
  if (review.deal.status === 'Won') return 'Closed Won';
  if (review.deal.status === 'Lost') return 'Closed Lost';

  const suggested = review.deal.suggested_deal_stage;
  if (!suggested) return currentStage;

  if (review.deal.stage_regression_override) {
    return suggested;
  }

  const currentIndex = DEAL_STAGES.indexOf(currentStage as (typeof DEAL_STAGES)[number]);
  const suggestedIndex = DEAL_STAGES.indexOf(suggested);

  // If either stage isn't in the known forward-progression list (e.g.
  // currentStage is already Closed Won/Lost -- shouldn't normally reach
  // here since closed deals aren't re-reviewed, but stay safe), don't
  // guess; leave the current stage as-is.
  if (currentIndex === -1 || suggestedIndex === -1) return currentStage;

  return suggestedIndex >= currentIndex ? suggested : currentStage;
}

// "Schedule Next Meeting" opens the user's actual Google Calendar, not an
// in-app scheduler -- Kairo has no calendar-write scope yet (read-only
// google-calendar-sync only). calendar_connections has no stored account
// email, so this is a generic deep link; the browser's own Google session
// resolves the right account.
export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';

export async function checkCalendarConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  return !!data;
}

// Single place that knows how to call google-calendar-sync, used by every
// entry point that needs a fresh read of the user's calendar: Inbox on
// load, Dashboard on load, and ScheduleMeetingButton when the user returns
// to the tab. Silently no-ops if there's no session or no calendar
// connected (a 404 from the function in that case) -- callers shouldn't
// have to know or care why a sync didn't run, only that it was attempted.
export async function syncGoogleCalendar(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/google-calendar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Sync failures shouldn't block rendering whatever page called this.
  }
}

// ---- Record Now (audio) flow ----------------------------------------
//
// mobile-recording-review expects, in this order:
//   1. a `conversations` row already exists with deal_id set
//   2. that row's audio_url is a Storage path in the private `recordings`
//      bucket, shaped `{user_id}/{deal_id}/{conversation_id}.{ext}`
//   3. only then is the function invoked with { conversation_id }
//
// The functions below implement exactly that sequence. Nothing here
// creates a `deals` row -- callers (NewDeal, Review) are responsible for
// having a real deal.id before calling submitRecording, since New Deal's
// flow creates the deal first and Review's flow already has one.

function extensionForMimeType(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  if (mimeType.startsWith('audio/aac')) return 'aac';
  if (mimeType.startsWith('audio/webm')) return 'webm';
  return 'm4a';
}

interface SubmitRecordingResult {
  conversationId: string;
  dealId: string;
}

// Creates the conversation row, uploads the blob to the private
// `recordings` bucket, stamps audio_url, then invokes
// mobile-recording-review and waits for it to finish. Throws with a
// message suitable for direct display if any step fails; the caller
// (RecordCallScreen) is expected to catch and route through
// describeRecordingError for phase-aware copy where useful.
export async function submitRecording(
  dealId: string,
  blob: Blob,
  mimeType: string
): Promise<SubmitRecordingResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to submit a recording.');
  }
  const userId = session.user.id;

  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      deal_id: dealId,
      input_type: 'audio',
      status: 'pending',
    })
    .select()
    .single();

  if (convError || !newConv) {
    throw new Error('Failed to create the call record. Please try again.');
  }

  const ext = extensionForMimeType(mimeType);
  const storagePath = `${userId}/${dealId}/${newConv.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(storagePath, blob, { contentType: mimeType, upsert: false });

  if (uploadError) {
    // Best-effort cleanup so a failed upload doesn't leave an orphaned
    // conversation row with no audio and no transcript.
    await supabase.from('conversations').delete().eq('id', newConv.id);
    throw new Error('Failed to upload the recording. Check your connection and try again.');
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ audio_url: storagePath })
    .eq('id', newConv.id);

  if (updateError) {
    throw new Error('Failed to save the recording. Please try again.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/mobile-recording-review`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ conversation_id: newConv.id }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(describeRecordingError(data.error));
  }

  return { conversationId: newConv.id, dealId };
}

// Maps mobile-recording-review's thrown error strings to user-facing copy.
// The function throws plain Error messages (see its catch block), so this
// matches on substrings rather than error codes.
export function describeRecordingError(rawError: string | undefined): string {
  if (!rawError) return 'Something went wrong while processing your recording. Please try again.';

  if (rawError.includes('MAX_TOKENS_TRUNCATED')) {
    return 'That recording was too long to process in one pass. Try a shorter call, or paste the transcript instead.';
  }
  if (rawError.includes('too short')) {
    return 'We couldn\'t get enough from that recording to review it. Make sure the call was actually captured, then try again.';
  }
  if (rawError.includes('Failed to download recording')) {
    return 'We couldn\'t retrieve your recording. Please try recording again.';
  }
  if (rawError.includes('Gemini')) {
    return 'Kairo couldn\'t process that recording right now. Please try again in a moment.';
  }
  return rawError;
}