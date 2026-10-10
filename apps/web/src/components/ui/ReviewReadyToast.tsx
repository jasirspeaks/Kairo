import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { markDealReviewViewed } from '@kairo/platform';

interface ReviewToast {
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

  const handleOpenDeal = useCallback((toast: ReviewToast) => {
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    if (toast.dealId) {
      markDealReviewViewed(toast.dealId);
      navigate(`/app/deals/${toast.dealId}`);
    }
  }, [navigate]);

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
              ...prev.filter((t) => t.id !== convId),
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
              ...prev.filter((t) => t.id !== convId),
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

  const renderToastCards = () =>
    toasts.map((toast) => {
      const isOngoing = toast.status === 'ongoing';
      return (
        <div
          key={toast.id}
          onClick={() => handleOpenDeal(toast)}
          className="pointer-events-auto cursor-pointer bg-surface/95 backdrop-blur-md border border-border/80 hover:border-primary/50 shadow-2xl rounded-2xl p-4 flex items-start gap-3.5 transition-all duration-300 animate-slide-up"
          role="button"
          tabIndex={0}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              isOngoing
                ? 'bg-primary/10 border border-primary/25 text-primary'
                : 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${isOngoing ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-textPrimary tracking-tight">
                {isOngoing ? 'Call Review in Progress' : 'Call Review Ready'}
              </h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="text-textMuted hover:text-textPrimary transition-colors p-0.5 rounded"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-textSecondary mt-1 leading-relaxed">
              {isOngoing ? (
                <>Review for <strong className="text-textPrimary">{toast.dealName}</strong> is ongoing and will be available once complete.</>
              ) : (
                <>Review for <strong className="text-textPrimary">{toast.dealName}</strong> is ready. Click to open deal.</>
              )}
            </p>
            <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
              <span>View Deal</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      );
    });

  return (
    <>
      {/* Mobile Screen: Floating notification-type modal at the top */}
      <div className="fixed top-4 inset-x-4 z-50 flex flex-col gap-2 pointer-events-none md:hidden">
        {renderToastCards()}
      </div>

      {/* Desktop Screen: Notification-type modal at bottom-right corner */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 flex-col gap-2 max-w-sm w-full pointer-events-none">
        {renderToastCards()}
      </div>
    </>
  );
}
