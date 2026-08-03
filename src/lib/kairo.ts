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

// Aggregates every completed call-review for a deal into the deal_state
// rollup (health score, current status, highest priority risk, etc).
// Called automatically after a call review saves, and on-demand from the
// Deal Review page's refresh action.
export async function refreshDealReview(dealId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to refresh a deal.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/deal-review-refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ deal_id: dealId }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Deal review refresh failed.');
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