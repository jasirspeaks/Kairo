import type { CSSProperties } from 'react';
import { supabase } from './supabase';
import { DealReview, DealStatus, DEAL_STATUS_COLORS } from '../types';

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