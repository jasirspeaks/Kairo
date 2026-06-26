import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
}

export function Coaching() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('deals').select('*').eq('user_id', user.id).eq('status', 'active')
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return; }
        const withState = await Promise.all(
          data.map(async (deal) => {
            const { data: state } = await supabase
              .from('deal_state').select('*').eq('deal_id', deal.id).single();
            return { ...deal, deal_state: state };
          })
        );
        setDeals(withState.filter(d => d.deal_state?.what_youre_missing?.length));
        setLoading(false);
      });
  }, [user]);

  const allGaps = deals.flatMap(d =>
    (d.deal_state?.what_youre_missing || []).map(gap => ({
      ...gap,
      deal_name: d.deal_name,
      deal_id: d.id,
    }))
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Coaching</h1>
        <p className="text-textSecondary text-sm">
          The most important unanswered questions across all your active deals.
        </p>
      </div>

      {allGaps.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="No gaps detected yet"
          description="Run deal reviews and Kairo will surface the most important unanswered questions across all your active deals."
        />
      ) : (
        <div className="space-y-3">
          {allGaps.map((gap, i) => (
            <button
              key={i}
              onClick={() => navigate(`/app/deals/${gap.deal_id}`)}
              className="card-hover w-full flex items-start gap-4 p-5 text-left group"
            >
              <div className="w-5 h-5 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-accent font-medium mb-1">{gap.deal_name}</p>
                <p className="text-white text-sm mb-2">{gap.gap}</p>
                <p className="text-textMuted text-xs italic">Ask: "{gap.question_to_answer}"</p>
              </div>
              <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors flex-shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}