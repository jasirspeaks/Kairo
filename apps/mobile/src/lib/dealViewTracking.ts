import AsyncStorage from '@react-native-async-storage/async-storage';

const VIEWED_DEALS_STORAGE_KEY = 'kairo_mobile_viewed_deal_reviews_v1';

let memoryCache: Record<string, number> = {};
let loaded = false;

async function ensureLoaded(): Promise<Record<string, number>> {
  if (loaded) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(VIEWED_DEALS_STORAGE_KEY);
    if (raw) {
      memoryCache = JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn('[mobile dealViewTracking] Failed to load cache:', err);
  }
  loaded = true;
  return memoryCache;
}

// Initial eager load
ensureLoaded().catch(() => {});

export function markDealReviewViewed(dealId: string, timestamp: number = Date.now()): void {
  if (!dealId) return;
  memoryCache[dealId] = Math.max(memoryCache[dealId] || 0, timestamp);
  AsyncStorage.setItem(VIEWED_DEALS_STORAGE_KEY, JSON.stringify(memoryCache)).catch((err) => {
    console.warn('[mobile dealViewTracking] Failed to persist viewed deal:', err);
  });
}

export function getDealReviewViewedAt(dealId: string): number | null {
  if (!dealId) return null;
  return memoryCache[dealId] || null;
}

export function isDealReviewViewed(dealId: string, callTimestamp?: string | number | null): boolean {
  if (!dealId) return false;
  const viewedAt = getDealReviewViewedAt(dealId);
  if (!viewedAt) return false;
  if (!callTimestamp) return true;
  const callTime = typeof callTimestamp === 'string' ? new Date(callTimestamp).getTime() : callTimestamp;
  return viewedAt >= callTime;
}
