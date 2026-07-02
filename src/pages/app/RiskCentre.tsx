import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertCircle, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { getStatusBg } from '../../lib/kairo';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
  latest_call_id: string | null;
}

export function RiskCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);

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
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const withState = await Promise.all(
      data.map(async (deal) => {
        const { data: state } = await supabase
          .from('deal_state')
          .select('*')
          .eq('deal_id', deal.id)
          .single();

        const { data: latestCall } = await supabase
          .from('conversations')
          .select('id')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...deal,
          deal_state: state,
          latest_call_id: latestCall?.id || null,
        };
      })
    );

    // Sort by risk severity
    const sorted = withState.sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
      return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
    });

    setDeals(sorted);
    setLoading(false);
  }

  function handleDealClick(deal: DealWithState) {
    if (deal.latest_call_id) {
      navigate(`/app/deals/${deal.id}/calls/${deal.latest_call_id}?source=risk-center`);
    } else {
      navigate(`/app/deals/${deal.id}/calls/latest?source=risk-center`);
    }
  }

  const atRisk = deals.filter(d =>
    d.deal_state?.current_status === 'At Risk' ||
    d.deal_state?.current_status === 'Lost Momentum'
  );
  const open = deals.filter(d => d.deal_state?.current_status === 'Open');
  const healthy = deals.filter(d => d.deal_state?.current_status === 'Healthy');
  const unreviewed = deals.filter(d => !d.deal_state?.current_status);

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Risk Center</h1>
        <p className="text-textSecondary text-sm">
          Active deals ranked by risk severity.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : deals.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="No active deals"
          description="Add deals and run reviews — Kairo will surface which ones need your attention most."
        />
      ) : (
        <div className="space-y-6">
          {atRisk.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold text-textPrimary">Requires Attention</h2>
                <span className="text-xs text-textMuted">({atRisk.length})</span>
              </div>
              <div className="space-y-2">
                {atRisk.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} onClick={() => handleDealClick(deal)} />
                ))}
              </div>
            </div>
          )}

          {open.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-textPrimary">Open</h2>
                <span className="text-xs text-textMuted">({open.length})</span>
              </div>
              <div className="space-y-2">
                {open.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} onClick={() => handleDealClick(deal)} />
                ))}
              </div>
            </div>
          )}

          {healthy.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-textPrimary">Healthy</h2>
                <span className="text-xs text-textMuted">({healthy.length})</span>
              </div>
              <div className="space-y-2">
                {healthy.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} onClick={() => handleDealClick(deal)} />
                ))}
              </div>
            </div>
          )}

          {unreviewed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-textMuted" />
                <h2 className="text-sm font-semibold text-textPrimary">Not Yet Reviewed</h2>
                <span className="text-xs text-textMuted">({unreviewed.length})</span>
              </div>
              <div className="space-y-2">
                {unreviewed.map(deal => (
                  <DealRiskCard key={deal.id} deal={deal} onClick={() => handleDealClick(deal)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DealRiskCardProps {
  deal: DealWithState;
  onClick: () => void;
}

function DealRiskCard({ deal, onClick }: DealRiskCardProps) {
  return (
    <button
      onClick={onClick}
      className="card-hover w-full flex items-center gap-4 px-5 py-4 text-left group"
    >
      <div className={cn(
        'w-2.5 h-2.5 rounded-full flex-shrink-0',
        deal.risk_level === 'high' ? 'bg-red-400' :
        deal.risk_level === 'medium' ? 'bg-amber-400' :
        deal.risk_level === 'low' ? 'bg-emerald-400' :
        'bg-border'
      )} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-textPrimary text-sm font-medium truncate">{deal.deal_name}</p>
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

      <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors flex-shrink-0" />
    </button>
  );
}