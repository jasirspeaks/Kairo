import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { getStatusBg } from '../../lib/kairo';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
}

export function Patterns() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchDeals() {
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const withState = await Promise.all(
      data.map(async (deal) => {
        const { data: state } = await supabase
          .from('deal_state')
          .select('*')
          .eq('deal_id', deal.id)
          .single();
        return { ...deal, deal_state: state };
      })
    );

    setDeals(withState.sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
      return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
    }));
    setLoading(false);
  }

  const atRisk = deals.filter(d =>
    d.deal_state?.current_status === 'At Risk' ||
    d.deal_state?.current_status === 'Lost Momentum'
  );
  const open = deals.filter(d => d.deal_state?.current_status === 'Open');
  const healthy = deals.filter(d => d.deal_state?.current_status === 'Healthy');

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Risk Center</h1>
        <p className="text-textSecondary text-sm">
          All active deals ranked by risk severity.
        </p>
      </div>

      {deals.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="No deals yet"
          description="Add deals and run reviews — Kairo will surface which ones need your attention most."
        />
      ) : (
        <div className="space-y-6">
          {atRisk.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Requires Attention</h2>
                <span className="text-xs text-textMuted">({atRisk.length})</span>
              </div>
              <div className="space-y-2">
                {atRisk.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} />
                ))}
              </div>
            </div>
          )}

          {open.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Open Questions</h2>
                <span className="text-xs text-textMuted">({open.length})</span>
              </div>
              <div className="space-y-2">
                {open.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} />
                ))}
              </div>
            </div>
          )}

          {healthy.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Healthy</h2>
                <span className="text-xs text-textMuted">({healthy.length})</span>
              </div>
              <div className="space-y-2">
                {healthy.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DealRiskCard({ deal }: { deal: DealWithState }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/app/deals/${deal.id}`)}
      className="card-hover w-full flex items-center gap-4 p-4 text-left group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white text-sm font-medium truncate">{deal.deal_name}</p>
          {deal.deal_state?.current_status && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full border flex-shrink-0',
              getStatusBg(deal.deal_state.current_status)
            )}>
              {deal.deal_state.current_status}
            </span>
          )}
        </div>
        <p className="text-textMuted text-xs">{deal.company_name}</p>
        {deal.deal_state?.highest_priority_risk && (
          <p className="text-textSecondary text-xs mt-1 truncate">
            {deal.deal_state.highest_priority_risk}
          </p>
        )}
      </div>
    </button>
  );
}

function useNavigate() {
  return require('react-router-dom').useNavigate();
}