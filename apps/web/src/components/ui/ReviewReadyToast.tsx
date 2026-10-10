import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { markDealReviewViewed } from '@kairo/platform';

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

  const handleOpenDeal = useCallback(
    (toast: ReviewToast) => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      if (toast.dealId) {
        markDealReviewViewed(toast.dealId);
        navigate(`/app/deals/${toast.dealId}`);
      }
    },
    [navigate]
  );

  useEffect(() => {
    // Listen for custom trigger from manual upload / live recording paths
    function handleManualTrigger(e: Event) {
      const customEvent = e as CustomEvent<{ dealId: string; dealName: string; conversationId?: string }>;
      if (!customEvent.detail) return;
      const { dealId, dealName, conversationId } = customEvent.detail;
      const id = conversationId || `manual-${Date.now()}`;
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
    }

    window.addEventListener('kairo-manual-review-started', handleManualTrigger);
    return () => {
      window.removeEventListener('kairo-manual-review-started', handleManualTrigger);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // Check OS notification permission
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignore
      }
    }

    // Check for any currently active ongoing reviews on mount
    supabase
      .from('conversations')
      .select('id, deal_id, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'retry_pending'])
      .order('created_at', { ascending: false })
      .limit(3)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const dealIds = Array.from(new Set(data.map((c) => c.deal_id).filter(Boolean))) as string[];
        if (dealIds.length === 0) return;

        const { data: dealsData } = await supabase
          .from('deals')
          .select('id, deal_name')
          .in('id', dealIds);
        const nameMap = new Map((dealsData || []).map((d) => [d.id, d.deal_name]));

        setToasts((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newItems: ReviewToast[] = [];
          for (const c of data) {
            if (!existingIds.has(c.id)) {
              newItems.push({
                id: c.id,
                dealId: c.deal_id,
                dealName: (c.deal_id && nameMap.get(c.deal_id)) || 'Your deal',
                status: 'ongoing',
                createdAt: Date.now(),
              });
            }
          }
          return [...prev, ...newItems];
        });
      });

    // Realtime listener for active call reviews (ongoing or completing)
    const channel = supabase
      .channel(`user-review-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as { id?: string; deal_id?: string | null; status?: string };
          if (!row || !row.id || !row.deal_id) return;
          const convId = row.id;
          const dealId = row.deal_id;

          const isOngoing = row.status === 'pending' || row.status === 'processing' || row.status === 'retry_pending';
          const isComplete = row.status === 'complete';

          if (!isOngoing && !isComplete) {
            // Dismiss toast if failed or deleted
            setToasts((prev) => prev.filter((t) => t.id !== convId));
            return;
          }

          let dealName = 'Your deal';
          try {
            const { data } = await supabase
              .from('deals')
              .select('deal_name')
              .eq('id', dealId)
              .single();
            if (data?.deal_name) {
              dealName = data.deal_name;
            }
          } catch {
            // ignore
          }

          if (isOngoing) {
            setToasts((prev) => [
              ...prev.filter((t) => t.id !== convId && t.dealId !== dealId),
              {
                id: convId,
                dealId,
                dealName,
                status: 'ongoing',
                createdAt: Date.now(),
              },
            ]);
          } else if (isComplete) {
            setToasts((prev) => [
              ...prev.filter((t) => t.id !== convId && t.dealId !== dealId),
              {
                id: convId,
                dealId,
                dealName,
                status: 'complete',
                createdAt: Date.now(),
              },
            ]);

            // Native OS notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Kairo — Call Review Ready', {
                  body: `Review for ${dealName} is ready.`,
                });
              } catch {
                // ignore
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

  // Render OS Notification Banner Cards
  const renderBannerCards = (variant: 'mobile' | 'desktop') =>
    toasts.map((toast) => {
      const isOngoing = toast.status === 'ongoing';
      return (
        <div
          key={toast.id}
          onClick={() => handleOpenDeal(toast)}
          className={`pointer-events-auto cursor-pointer transition-all duration-300 ease-out group select-none ${
            variant === 'mobile'
              ? 'w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary/50 shadow-[0_12px_40px_rgba(0,0,0,0.65)] rounded-3xl p-3.5 flex items-center gap-3 animate-slide-down'
              : 'w-full bg-[#160D21]/95 backdrop-blur-2xl border border-primary shadow-[0_12px_40px_rgba(0,0,0,0.65)] rounded-2xl p-4 flex items-start gap-3.5 animate-slide-up hover:border-primaryLight'
          }`}
          role="button"
          tabIndex={0}
        >
          {/* App / Event Glyph */}
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
              isOngoing
                ? 'bg-primary/20 border border-primary text-primary shadow-[0_0_15px_rgba(112,66,197,0.35)]'
                : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(61,214,140,0.35)]'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${isOngoing ? 'animate-pulse' : ''}`} />
          </div>

          {/* Notification Content */}
          <div className="flex-1 min-w-0">
            {/* OS Header Pill Line */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold tracking-widest uppercase text-textMuted bg-surfaceSecondary px-1.5 py-0.5 rounded border border-border/50">
                  KAIRO
                </span>
                <span className="text-[10px] text-textMuted font-mono">· NOW</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="text-textMuted hover:text-textPrimary transition-colors p-1 rounded-full hover:bg-surfaceHigh -mr-1"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Event Title */}
            <div className="mt-1 flex items-center gap-2">
              <h4 className="text-xs font-semibold text-textPrimary tracking-tight">
                {isOngoing ? 'Call Review in Progress' : 'Call Review Ready'}
              </h4>
              {isOngoing && (
                <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                  live
                </span>
              )}
            </div>

            {/* Description Body */}
            <p className="text-xs text-textSecondary mt-0.5 leading-relaxed line-clamp-2">
              {isOngoing ? (
                <>Review for <strong className="text-textPrimary">{toast.dealName}</strong> is ongoing and will be ready shortly.</>
              ) : (
                <>Review for <strong className="text-textPrimary">{toast.dealName}</strong> is complete. Tap to inspect deal.</>
              )}
            </p>

            {/* Action Cue */}
            <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary group-hover:text-primaryHover transition-colors">
              <span>View Deal Review</span>
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      );
    });

  return (
    <>
      {/* Mobile Screen: Top Dynamic-Island Floating Notification */}
      <div className="fixed top-3 inset-x-3 z-50 flex flex-col gap-2.5 pointer-events-none md:hidden">
        {renderBannerCards('mobile')}
      </div>

      {/* Desktop Screen: Bottom-Right macOS/Windows Notification Toast */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {renderBannerCards('desktop')}
      </div>
    </>
  );
}
