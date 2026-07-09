import { supabase } from './supabase';
import { DealReview } from '../types';

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

export async function reviewDeal(
  transcript: string,
  deal_context?: DealContext
): Promise<DealReview> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to review a deal.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/analyze-conversation`,
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
    throw new Error(data.error || 'Deal review failed. Please try again.');
  }

  return data.review as DealReview;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'Healthy': return 'text-emerald-600';
    case 'Open': return 'text-amber-600';
    case 'At Risk': return 'text-red-600';
    case 'Lost Momentum': return 'text-textMuted';
    default: return 'text-textSecondary';
  }
}

export function getStatusBg(status: string): string {
  switch (status) {
    case 'Healthy': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'Open': return 'bg-amber-50 border-amber-200 text-amber-700';
    case 'At Risk': return 'bg-red-50 border-red-200 text-red-700';
    case 'Lost Momentum': return 'bg-surfaceHigh border-border text-textMuted';
    default: return 'bg-surfaceHigh border-border text-textSecondary';
  }
}

export function getRiskLevel(status: string): 'high' | 'medium' | 'low' | 'none' {
  switch (status) {
    case 'At Risk': return 'high';
    case 'Lost Momentum': return 'high';
    case 'Open': return 'medium';
    case 'Healthy': return 'low';
    default: return 'none';
  }
}