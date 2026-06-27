import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, CheckCircle, Clock, TrendingDown, ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { getStatusBg } from '../../lib/kairo';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchDeals() {
    const { data: dealsData } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (!dealsData) { setLoading(false); return; }

    const dealsWithState = await Promise.all(
      dealsData.map(async (deal) => {
        const { data: state } = await supabase
          .from('deal_state')
          .select('*')
          .eq('deal_id', deal.id)
          .single();
        return { ...deal, deal_state: state };
      })
    );

    // Sort by risk — At Risk and Lost Momentum first
    const sorted = dealsWithState.sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
      return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
    });

    setDeals(sorted);
    setLoading(false);
  }

  function getStatusIcon(status: string | null) {
    switch (status) {
      case 'Healthy': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'Open': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'At Risk': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'Lost Momentum': return <TrendingDown className="w-4 h-4 text-textMuted" />;
      default: return <Clock className="w-4 h-4 text-textMuted" />;
    }
  }

  const greeting = new Date().getHours() < 12
    ? 'Good morning'
    : new Date().getHours() < 17
    ? 'Good afternoon'
    : 'Good evening';

  const atRiskCount = deals.filter(d => d.risk_level === 'high').length;
  const activeCount = deals.length;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white mb-1">
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-textSecondary text-sm">
            {activeCount === 0
              ? 'No active deals yet. Add your first deal to get started.'
              : atRiskCount > 0
              ? `${atRiskCount} deal${atRiskCount !== 1 ? 's' : ''} require${atRiskCount === 1 ? 's' : ''} your attention.`
              : `${activeCount} active deal${activeCount !== 1 ? 's' : ''} — all looking good.`
            }
          </p>
        </div>
        <Button onClick={() => navigate('/app/new')} size="lg">
          <Plus className="w-4 h-4" />
          New Deal
        </Button>
      </div>

      {/* Stats */}
      {deals.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4">
            <p className="section-label mb-1">Active Deals</p>
            <p className="text-2xl font-display font-bold text-white">{activeCount}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Require Attention</p>
            <p className={cn('text-2xl font-display font-bold', atRiskCount > 0 ? 'text-red-400' : 'text-white')}>
              {atRiskCount}
            </p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Healthy</p>
            <p className="text-2xl font-display font-bold text-emerald-400">
              {deals.filter(d => d.deal_state?.current_status === 'Healthy').length}
            </p>
          </div>
        </div>
      )}

      {/* Deals list */}
      <div>
        <h2 className="section-label mb-4">
          {atRiskCount > 0 ? 'Deals Requiring Attention' : 'Active Deals'}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card h-20 animate-pulse" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title="No active deals"
            description="Add your first deal and paste a call transcript. Kairo will identify what you're missing and what to do next."
            action={
              <Button onClick={() => navigate('/app/new')}>
                <Plus className="w-4 h-4" />
                Add Your First Deal
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {deals.map(deal => (
              <button
                key={deal.id}
                onClick={() => navigate(`/app/deals/${deal.id}`)}
                className="card-hover w-full flex items-center gap-4 p-4 text-left group"
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {getStatusIcon(deal.deal_state?.current_status || null)}
                </div>

                {/* Deal info */}
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
                  <div className="flex items-center gap-3">
                    <p className="text-textMuted text-xs">{deal.company_name}</p>
                    {deal.deal_state?.highest_priority_risk && (
                      <>
                        <span className="text-textMuted text-xs">·</span>
                        <p className="text-textMuted text-xs truncate max-w-xs">
                          {deal.deal_state.highest_priority_risk}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Manager note preview */}
                {deal.deal_state?.manager_note && (
                  <div className="hidden lg:block max-w-48 flex-shrink-0">
                    <p className="text-xs text-textSecondary italic truncate">
                      "{deal.deal_state.manager_note}"
                    </p>
                  </div>
                )}

                <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}