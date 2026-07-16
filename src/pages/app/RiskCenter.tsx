import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertCircle, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { getStatusBg } from '../../lib/kairo';
import { cn } from '../../lib/utils';

interface DealWithState extends Deal {
  deal_state: DealState | null;
  latest_call_id: string | null;
}

type FilterTab = 'attention' | 'open' | 'healthy' | 'unreviewed';

export function RiskCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('attention');

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

  const TABS: { key: FilterTab; label: string; count: number; icon: React.ElementType; iconClass: string }[] = [
    { key: 'attention', label: 'At Risk', count: atRisk.length, icon: AlertCircle, iconClass: 'text-red-500' },
    { key: 'open', label: 'Open', count: open.length, icon: Clock, iconClass: 'text-amber-500' },
    { key: 'healthy', label: 'Healthy', count: healthy.length, icon: CheckCircle, iconClass: 'text-emerald-500' },
    { key: 'unreviewed', label: 'Unreviewed', count: unreviewed.length, icon: ShieldAlert, iconClass: 'text-textMuted' },
  ];

  const activeList = {
    attention: atRisk,
    open,
    healthy,
    unreviewed,
  }[tab];

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar title="Risk Center" />
      </div>

      <div className="animate-fade-in">
        <div className="mb-4 md:mb-8 hidden md:block">
          <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Risk Center</h1>
          <p className="text-textSecondary text-sm">Active deals ranked by risk severity.</p>
        </div>

        {/* Segmented control - horizontally scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar">
          {TABS.map(({ key, label, count, icon: Icon, iconClass }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-medium whitespace-nowrap flex-shrink-0 min-h-[36px] transition-colors',
                tab === key
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-surface border-border text-textSecondary'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', tab === key ? 'text-primary' : iconClass)} />
              {label}
              <span className={cn('text-[10px]', tab === key ? 'text-primary' : 'text-textMuted')}>
                {count}
              </span>
            </button>
          ))}
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
        ) : activeList.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-6 h-6" />}
            title="Nothing here"
            description="No deals currently fall into this category."
          />
        ) : (
          <div className="space-y-2">
            {activeList.map(deal => (
              <DealRiskCard key={deal.id} deal={deal} onClick={() => handleDealClick(deal)} />
            ))}
          </div>
        )}
      </div>
    </>
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
      className="card-hover w-full flex items-stretch gap-3 pl-0 pr-4 py-3 text-left group min-h-[64px] overflow-hidden"
    >
      <div className={cn(
        'w-1 self-stretch rounded-full flex-shrink-0',
        deal.risk_level === 'high' ? 'bg-red-400' :
        deal.risk_level === 'medium' ? 'bg-amber-400' :
        deal.risk_level === 'low' ? 'bg-emerald-400' :
        'bg-border'
      )} />

      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-textPrimary text-sm font-medium truncate">{deal.deal_name}</p>
          {deal.deal_state?.current_status && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0',
              getStatusBg(deal.deal_state.current_status)
            )}>
              {deal.deal_state.current_status}
            </span>
          )}
        </div>
        <p className="text-textMuted text-xs truncate">
          {deal.deal_state?.highest_priority_risk || deal.company_name}
        </p>
      </div>

      <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors flex-shrink-0 self-center" />
    </button>
  );
}