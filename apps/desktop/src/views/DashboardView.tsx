import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  formatDealValue,
  getHealthScoreColor,
  DEAL_STAGES,
} from '@kairo/core';
import { getDashboardDeals, useAuth, type DealWithState } from '@kairo/api';
import { useNavigate } from 'react-router-dom';

export function DashboardView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<DealWithState[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getDashboardDeals(user.id);
      setDeals(data);
    } catch (err) {
      console.error('Failed to load dashboard deals', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const totalValue = deals.reduce((acc, d) => acc + (d.deal_value || 0), 0);
  const highRiskDeals = deals.filter(
    (d) => d.risk_level === 'high'
  );
  const avgHealthScore =
    deals.length > 0
      ? Math.round(
          deals.reduce(
            (acc, d) => acc + (d.deal_state?.deal_health_score ?? 50),
            0
          ) / deals.length
        )
      : 0;

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-textPrimary font-display">
            Pipeline Dashboard
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Active deal intelligence, health scores, and risk alerts
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted text-xs">
            <span>Pipeline Value</span>
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl font-bold text-textPrimary mt-2">
            {formatDealValue(totalValue)}
          </div>
          <div className="text-[11px] text-textMuted mt-1">Across active opportunities</div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted text-xs">
            <span>Active Deals</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-textPrimary mt-2">
            {deals.length}
          </div>
          <div className="text-[11px] text-emerald-400/90 mt-1">In qualification cycle</div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted text-xs">
            <span>High Risk Deals</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-textPrimary mt-2">
            {highRiskDeals.length}
          </div>
          <div className="text-[11px] text-rose-400/90 mt-1">Require immediate review</div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-textMuted text-xs">
            <span>Avg Health Score</span>
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div
            className="text-xl font-bold mt-2"
            style={{ color: getHealthScoreColor(avgHealthScore) }}
          >
            {avgHealthScore}
            <span className="text-xs text-textMuted font-normal"> / 100</span>
          </div>
          <div className="text-[11px] text-textMuted mt-1">Weighted confidence</div>
        </div>
      </div>

      {/* Deals list */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-textPrimary">
            Active Deals
          </h2>
          <button
            onClick={() => navigate('/deals')}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View all deals <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-textMuted text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span>Loading pipeline data...</span>
          </div>
        ) : deals.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-textMuted text-xs">
            <p>No active deals found.</p>
            <button
              onClick={() => navigate('/deals')}
              className="btn-primary text-xs mt-2"
            >
              Create or Import Deal
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {deals.slice(0, 6).map((deal) => {
              const score = deal.deal_state?.deal_health_score ?? 50;
              const color = getHealthScoreColor(score);

              return (
                <div
                  key={deal.id}
                  onClick={() => navigate('/deals')}
                  className="py-3 flex items-center justify-between hover:bg-surfaceHigh/40 px-2 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono"
                      style={{
                        backgroundColor: `${color}1A`,
                        color,
                        border: `1px solid ${color}33`,
                      }}
                    >
                      {score}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-textPrimary">
                        {deal.company_name}
                      </h3>
                      <p className="text-[11px] text-textMuted">
                        {deal.champion || deal.deal_name} • {deal.deal_stage}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-textPrimary">
                        {formatDealValue(deal.deal_value)}
                      </p>
                      <p className="text-[10px] text-textMuted font-mono">
                        {deal.risk_level ? `${deal.risk_level.toUpperCase()} RISK` : 'NORMAL'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-textMuted" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
