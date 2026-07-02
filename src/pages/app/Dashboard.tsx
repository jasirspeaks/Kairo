import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
}

function RiskDot({ riskLevel }: { riskLevel: string }) {
  return (
    <div className={cn(
      'w-2.5 h-2.5 rounded-full flex-shrink-0',
      riskLevel === 'high' ? 'bg-red-400' :
      riskLevel === 'medium' ? 'bg-amber-400' :
      riskLevel === 'low' ? 'bg-emerald-400' :
      'bg-border'
    )} />
  );
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

    const sorted = dealsWithState.sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
      return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
    });

    setDeals(sorted);
    setLoading(false);
  }

  const greeting = new Date().getHours() < 12
    ? 'Good morning'
    : new Date().getHours() < 17
    ? 'Good afternoon'
    : 'Good evening';

  const atRiskCount = deals.filter(d => d.risk_level === 'high').length;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-textSecondary text-sm">
            {deals.length === 0
              ? 'No active deals yet. Add your first deal to get started.'
              : atRiskCount > 0
              ? `${atRiskCount} deal${atRiskCount !== 1 ? 's' : ''} require${atRiskCount === 1 ? 's' : ''} your attention.`
              : `${deals.length} active deal${deals.length !== 1 ? 's' : ''} — all looking good.`
            }
          </p>
        </div>
        <Button onClick={() => navigate('/app/new')} size="lg">
          <Plus className="w-4 h-4" />
          New Deal
        </Button>
      </div>

      {/* Deals list */}
      <div>
        <h2 className="section-label mb-4">Active Deals</h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="card h-14 animate-pulse" />
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
          <div className="space-y-2">
            {deals.map(deal => (
              <button
                key={deal.id}
                onClick={() => navigate(`/app/deals/${deal.id}`)}
                className="card-hover w-full flex items-center gap-4 px-5 py-4 text-left group"
              >
                <RiskDot riskLevel={deal.risk_level} />

                <div className="flex-1 min-w-0">
                  <p className="text-textPrimary text-sm font-medium truncate">{deal.deal_name}</p>
                  {deal.deal_state?.highest_priority_risk ? (
                    <p className="text-textMuted text-xs truncate mt-0.5">
                      {deal.deal_state.highest_priority_risk}
                    </p>
                  ) : (
                    <p className="text-textMuted text-xs mt-0.5">{deal.company_name}</p>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}