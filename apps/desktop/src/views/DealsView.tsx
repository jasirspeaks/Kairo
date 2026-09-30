import React, { useEffect, useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  TrendingUp,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  formatDealValue,
  getHealthScoreColor,
  type Deal,
} from '@kairo/core';
import { getDeals, useAuth } from '@kairo/api';

export function DealsView() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getDeals(user.id);
      setDeals(data);
    } catch (err) {
      console.error('Failed to fetch deals', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, [user]);

  const filteredDeals = deals.filter(
    (d) =>
      d.company_name.toLowerCase().includes(search.toLowerCase()) ||
      d.deal_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.champion && d.champion.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-textPrimary font-display">
            Deals Catalog
          </h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Manage your opportunities and review deal intelligence
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDeals}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search deals by company or opportunity name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 py-2 text-xs"
          />
        </div>
      </div>

      {/* Deals list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surfaceHigh/30 grid grid-cols-12 text-[11px] font-semibold text-textMuted uppercase tracking-wider">
          <div className="col-span-5">Company & Deal Name</div>
          <div className="col-span-3">Stage</div>
          <div className="col-span-2">Risk Level</div>
          <div className="col-span-2 text-right">Value</div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-textMuted text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span>Loading deals...</span>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-textMuted text-xs">
            <Building2 className="w-8 h-8 text-textMuted/50" />
            <p>No deals found matching criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredDeals.map((deal) => {
              return (
                <div
                  key={deal.id}
                  className="px-5 py-3.5 grid grid-cols-12 items-center hover:bg-surfaceHigh/40 transition-colors text-xs"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-surfaceHigh border border-border flex items-center justify-center text-textPrimary font-semibold flex-shrink-0">
                      {deal.company_name[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-textPrimary">
                        {deal.company_name}
                      </h3>
                      <p className="text-[11px] text-textMuted">
                        {deal.deal_name} {deal.champion ? `• ${deal.champion}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-3">
                    <span className="px-2 py-0.5 rounded-full bg-surfaceHigh border border-border text-[11px] font-medium text-textSecondary">
                      {deal.deal_stage}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        deal.risk_level === 'high'
                          ? 'bg-rose-400'
                          : deal.risk_level === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-[11px] text-textSecondary font-mono capitalize">
                      {deal.risk_level || 'low'}
                    </span>
                  </div>

                  <div className="col-span-2 text-right font-semibold text-textPrimary">
                    {formatDealValue(deal.deal_value)}
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
