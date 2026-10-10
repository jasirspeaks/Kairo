import { localStorageAdapter } from './localStorageAdapter';

const VIEWED_DEALS_STORAGE_KEY = 'kairo_viewed_deal_reviews_v1';

export function getViewedDealReviews(): Record<string, number> {
  try {
    const raw = localStorageAdapter.getItem(VIEWED_DEALS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function markDealReviewViewed(dealId: string, timestamp: number = Date.now()): void {
  if (!dealId) return;
  try {
    const map = getViewedDealReviews();
    map[dealId] = Math.max(map[dealId] || 0, timestamp);
    localStorageAdapter.setItem(VIEWED_DEALS_STORAGE_KEY, JSON.stringify(map));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('kairo-deal-viewed', { detail: { dealId, timestamp } }));
    }
  } catch (err) {
    console.warn('[dealViewTracking] Failed to save viewed deal:', err);
  }
}

export function getDealReviewViewedAt(dealId: string): number | null {
  if (!dealId) return null;
  const map = getViewedDealReviews();
  return map[dealId] || null;
}

export function isDealReviewViewed(dealId: string, callTimestamp?: string | number | null): boolean {
  if (!dealId) return false;
  const viewedAt = getDealReviewViewedAt(dealId);
  if (!viewedAt) return false;
  if (!callTimestamp) return true;
  const callTime = typeof callTimestamp === 'string' ? new Date(callTimestamp).getTime() : callTimestamp;
  return viewedAt >= callTime;
}
