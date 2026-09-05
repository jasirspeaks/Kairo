import type { CSSProperties } from 'react';
import { supabase } from './supabase';
import { DealReview, DealStatus, DealStage, DEAL_STATUS_COLORS } from '../types';

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

// Writes the deal-level half of an extraction into deal_state. review.deal
// already IS the deal's current state -- computed by call-review with the
// full prior history as context. No aggregation function, no second AI
// call. Call this right after every successful reviewCall().
export async function saveDealState(dealId: string, userId: string, review: DealReview): Promise<void> {
  const { data: existing } = await supabase
    .from('deal_state')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle();

  const stateRow = {
    deal_id: dealId,
    user_id: userId,
    current_status: review.deal.status,
    confidence: review.deal.confidence,
    deal_health_score: review.deal.health_score,
    highest_priority_risk: review.deal.highest_priority_risk.risk,
    highest_priority_risk_full: review.deal.highest_priority_risk,
    what_youre_missing: review.deal.what_youre_missing,
    key_follow_up_message: review.deal.recommended_next_action,
    manager_note: review.deal.manager_note,
    supporting_evidence: review.supporting_evidence ?? [],
    last_review_summary: review.deal.status_reason,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('deal_state').update(stateRow).eq('id', existing.id);
  } else {
    await supabase.from('deal_state').insert(stateRow);
  }
}

// Upserts stakeholders surfaced by a call, matched by (deal_id, name) so a
// returning stakeholder updates their sentiment/role instead of duplicating.
export async function saveStakeholders(dealId: string, userId: string, review: DealReview): Promise<void> {
  if (!Array.isArray(review.stakeholder_signals) || review.stakeholder_signals.length === 0) return;

  for (const s of review.stakeholder_signals) {
    const { data: existing } = await supabase
      .from('stakeholders')
      .select('id')
      .eq('deal_id', dealId)
      .eq('name', s.name)
      .maybeSingle();

    const row = {
      deal_id: dealId,
      user_id: userId,
      name: s.name,
      role: s.role,
      sentiment: s.sentiment,
      notes: s.evidence || null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from('stakeholders').update(row).eq('id', existing.id);
    } else {
      await supabase.from('stakeholders').insert(row);
    }
  }
}

// Returns the exact Blueprint hex code for a Deal Status, for inline styles
// (badges, risk-dots, chart legends) where a Tailwind utility class can't
// express the precise color.
export function getStatusColor(status: string): string {
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

// A user picks a stage up through "Decision" (see DEAL_STAGES) -- Closed
// Won and Closed Lost are never manually selected. Instead, every time a
// call comes back, check the AI's deal.status: if it's unambiguously Won
// or Lost, the deal_stage should reflect that regardless of which stage
// the user had it parked in. Any other status leaves the user's chosen
// stage untouched -- this only ever moves a deal forward into a closed
// state, never back out of one or sideways between open stages.
export function resolveDealStage(selectedStage: DealStage, dealStatus: string): DealStage {
  if (dealStatus === 'Won') return 'Closed Won';
  if (dealStatus === 'Lost') return 'Closed Lost';
  return selectedStage;
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