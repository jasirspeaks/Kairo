import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface ReviewToast {
  id: string;
  dealId: string | null;
  dealName: string;
  createdAt: number;
}

export function ReviewReadyToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ReviewToast[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    // Request OS notification permissions early if browser supports it
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignore
      }
    }

    const channel = supabase
      .channel(`user-review-ready-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newRow = payload.new as { id: string; deal_id: string | null; status: string };
          const oldRow = payload.old as { status?: string };

          // Trigger only when transitioning into complete
          if (newRow.status === 'complete' && oldRow?.status !== 'complete') {
            let dealName = 'Your deal';
            if (newRow.deal_id) {
              try {
                const { data } = await supabase
                  .from('deals')
                  .select('deal_name')
                  .eq('id', newRow.deal_id)
                  .single();
                if (data?.deal_name) {
                  dealName = data.deal_name;
                }
              } catch {
                // ignore
              }
            }

            // In-app toast
            setToasts((prev) => [
              ...prev.filter((t) => t.id !== newRow.id),
              {
                id: newRow.id,
                dealId: newRow.deal_id,
                dealName,
                createdAt: Date.now(),
              },
            ]);

            // Native OS notification (Desktop & Web)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Kairo — Call Review Ready', {
                  body: `5-pillar intelligence is ready for ${dealName}.`,
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

  // Auto-dismiss toasts older than 10 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.createdAt < 10000));
    }, 1000);

    return () => clearInterval(interval);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-surface/95 backdrop-blur-md border border-emerald-500/30 shadow-2xl rounded-2xl p-4 flex items-start gap-3.5 transition-all duration-300 animate-slide-up"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-textPrimary tracking-tight">Call Review Ready</h4>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-textMuted hover:text-textPrimary transition-colors p-0.5 rounded"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-textSecondary mt-0.5 line-clamp-1">
              5-pillar analysis complete for <strong className="text-textPrimary">{toast.dealName}</strong>
            </p>
            {toast.dealId && (
              <button
                onClick={() => {
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  navigate(`/app/deals/${toast.dealId}/calls/${toast.id}`);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors mt-2"
              >
                View Review <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
