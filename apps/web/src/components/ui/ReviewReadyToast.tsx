import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { markDealReviewViewed, isDealReviewViewed } from '@kairo/platform';

export interface ReviewToast {
  id: string;
  dealId: string | null;
  dealName: string;
  status: 'ongoing' | 'complete';
  createdAt: number;
}

export function ReviewReadyToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ReviewToast[]>([]);
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  const handleOpenDeal = useCallback(
    (toast: ReviewToast) => {
      dismissedIdsRef.current.add(toast.id);
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      if (toast.dealId) {
        markDealReviewViewed(toast.dealId);
        navigate(`/app/deals/${toast.dealId}`);
      }
    },
    [navigate]
  );

  const handleDismiss = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    dismissedIdsRef.current.add(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Synchronize ongoing and recently completed reviews from Supabase in real time
  const syncReviews = useCallback(async () => {
    if (!user?.id) return;

    try {
      // 1. Fetch active/ongoing reviews
      const { data: activeData, error: activeErr } = await supabase
        .from('conversations')
        .select('id, deal_id, status, created_at, updated_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing', 'retry_pending'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (activeErr) throw activeErr;

      // 2. Fetch recently completed reviews (within last 60 seconds)
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentCompleted, error: compErr } = await supabase
        .from('conversations')
        .select('id, deal_id, status, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'complete')
        .gte('created_at', sixtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (compErr) throw compErr;

      const combined = [...(activeData || []), ...(recentCompleted || [])];
      if (combined.length === 0) {
        // If there are ongoing toasts locally but no active conversations in DB, remove stale ongoing toasts
        setToasts((prev) => prev.filter((t) => t.status === 'complete'));
        return;
      }

      // Collect deal IDs needing deal_name lookup
      const dealIds = Array.from(new Set(combined.map((c) => c.deal_id).filter(Boolean))) as string[];
      let nameMap = new Map<string, string>();
      if (dealIds.length > 0) {
        const { data: dealsData } = await supabase
          .from('deals')
          .select('id, deal_name')
          .in('id', dealIds);
        nameMap = new Map((dealsData || []).map((d) => [d.id, d.deal_name]));
      }

      setToasts((prev) => {
        const nextMap = new Map<string, ReviewToast>();

        // Keep existing toasts that are still valid
        for (const t of prev) {
          nextMap.set(t.id, t);
        }

        for (const c of combined) {
          if (dismissedIdsRef.current.has(c.id)) continue;

          const isOngoing = c.status === 'pending' || c.status === 'processing' || c.status === 'retry_pending';
          const isComplete = c.status === 'complete';

          // If complete and user has already viewed this deal review, don't show toast
          if (isComplete && c.deal_id && isDealReviewViewed(c.deal_id, c.created_at)) {
            nextMap.delete(c.id);
            continue;
          }

          const dealName = (c.deal_id && nameMap.get(c.deal_id)) || 'Your deal';
          const existing = nextMap.get(c.id);

          if (!existing) {
            nextMap.set(c.id, {
              id: c.id,
              dealId: c.deal_id,
              dealName,
              status: isOngoing ? 'ongoing' : 'complete',
              createdAt: Date.now(),
            });

            if (isComplete && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Kairo — Review Ready', {
                  body: `Review for ${dealName} is ready.`,
                });
              } catch {
                // ignore
              }
            }
          } else if (existing.status === 'ongoing' && isComplete) {
            // Transition from ongoing to complete in real time!
            nextMap.set(c.id, {
              ...existing,
              status: 'complete',
              createdAt: Date.now(),
            });

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Kairo — Review Ready', {
                  body: `Review for ${dealName} is ready.`,
                });
              } catch {
                // ignore
              }
            }
          }
        }

        // Remove any ongoing toasts whose conversation is no longer ongoing in DB
        const activeIds = new Set((activeData || []).map((c) => c.id));
        const recentCompIds = new Set((recentCompleted || []).map((c) => c.id));
        for (const [id, toast] of nextMap.entries()) {
          if (toast.status === 'ongoing' && !activeIds.has(id)) {
            if (recentCompIds.has(id)) {
              toast.status = 'complete';
              toast.createdAt = Date.now();
            } else {
              nextMap.delete(id);
            }
          }
        }

        return Array.from(nextMap.values());
      });
    } catch (err) {
      console.warn('[ReviewReadyToast] Realtime sync warning:', err);
    }
  }, [user?.id]);

  // Fast background polling & visibility synchronization
  useEffect(() => {
    if (!user?.id) return;

    // Check OS notification permission once
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignore
      }
    }

    // Initial check
    syncReviews();

    // Responsive poll: 2.5s if ongoing reviews or toasts exist, 5s when idle
    const hasOngoing = toasts.some((t) => t.status === 'ongoing');
    const intervalMs = hasOngoing || toasts.length > 0 ? 2500 : 5000;

    const interval = setInterval(() => {
      syncReviews();
    }, intervalMs);

    // Sync immediately when user refocuses the tab
    const handleFocus = () => {
      syncReviews();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user?.id, syncReviews, toasts]);

  // Listen for local custom events (manual submissions, upload completions, etc.)
  useEffect(() => {
    function handleManualTrigger(e: Event) {
      const customEvent = e as CustomEvent<{ dealId: string; dealName: string; conversationId?: string }>;
      if (!customEvent.detail) return;
      const { dealId, dealName, conversationId } = customEvent.detail;
      const id = conversationId || `manual-${dealId}-${Date.now()}`;

      setToasts((prev) => [
        ...prev.filter((t) => t.dealId !== dealId),
        {
          id,
          dealId,
          dealName: dealName || 'Your deal',
          status: 'ongoing',
          createdAt: Date.now(),
        },
      ]);

      // Immediate background check
      syncReviews();
    }

    window.addEventListener('kairo-manual-review-started', handleManualTrigger);
    window.addEventListener('kairo-review-updated', syncReviews);
    return () => {
      window.removeEventListener('kairo-manual-review-started', handleManualTrigger);
      window.removeEventListener('kairo-review-updated', syncReviews);
    };
  }, [syncReviews]);

  // Supabase Realtime channel subscription on conversations
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-review-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          syncReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, syncReviews]);

  // Auto-dismiss completed toasts older than 12 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) =>
        prev.filter((t) => {
          if (t.status === 'complete') {
            return now - t.createdAt < 12000;
          }
          return true;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  const renderBannerCards = () =>
    toasts.map((toast) => {
      const isOngoing = toast.status === 'ongoing';
      return (
        <div
          key={toast.id}
          onClick={() => handleOpenDeal(toast)}
          className="pointer-events-auto cursor-pointer w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.7)] rounded-2xl p-4 flex flex-col gap-2 select-none animate-slide-up transition-opacity"
          role="button"
          tabIndex={0}
        >
          {/* Header row: Title + Close Button */}
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-textPrimary tracking-tight">
              {isOngoing ? 'Review in Progress' : 'Review Ready'}
            </h4>
            <button
              onClick={(e) => handleDismiss(toast.id, e)}
              className="text-textMuted hover:text-textPrimary transition-colors p-1 rounded-full hover:bg-surfaceHigh -mr-1"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description Body */}
          <p className="text-xs text-textSecondary leading-relaxed">
            {isOngoing ? (
              <>Review for <strong className="text-textPrimary font-semibold">{toast.dealName}</strong> is in progress and will be available once complete.</>
            ) : (
              <>Review for <strong className="text-textPrimary font-semibold">{toast.dealName}</strong> is ready. Click to open.</>
            )}
          </p>

          {/* Action Cue */}
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary">
            <span>View Deal Review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      );
    });

  return (
    <>
      {/* Mobile Screen: Top Floating Notification */}
      <div className="fixed top-3 inset-x-3 z-50 flex flex-col gap-2.5 pointer-events-none md:hidden">
        {renderBannerCards()}
      </div>

      {/* Desktop Screen: Bottom-Right System Notification */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {renderBannerCards()}
      </div>
    </>
  );
}
