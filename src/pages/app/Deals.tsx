import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, Plus, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Deal, DealState, DEAL_STAGES, DealStage, DealStatus } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { formatDate, cn } from '../../lib/utils';

type TimelineFilter = 'all' | '7d' | '30d' | '90d';
type StatusFilter = 'active' | 'all' | DealStatus;

interface DealRow extends Deal {
  current_status: DealStatus | null;
  last_contact: string | null;
  next_meeting: string | null;
}

function formatValue(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD' }).format(value);
}

export function Deals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchDeals() {
    setLoading(true);

    const { data: deals } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (!deals || deals.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const dealIds = deals.map(d => d.id);

    const [{ data: states }, { data: lastCalls }, { data: meetings }] = await Promise.all([
      supabase.from('deal_state').select('deal_id, current_status').in('deal_id', dealIds),
      supabase.from('conversations').select('deal_id, created_at').in('deal_id', dealIds).order('created_at', { ascending: false }),
      supabase.from('scheduled_meetings').select('deal_id, start_time')
        .in('deal_id', dealIds).eq('status', 'assigned')
        .gte('start_time', new Date().toISOString()).order('start_time', { ascending: true }),
    ]);

    const statusByDeal = new Map((states || []).map(s => [s.deal_id, s.current_status]));
    const lastContactByDeal = new Map<string, string>();
    (lastCalls || []).forEach(c => {
      if (!lastContactByDeal.has(c.deal_id)) lastContactByDeal.set(c.deal_id, c.created_at);
    });
    const nextMeetingByDeal = new Map<string, string>();
    (meetings || []).forEach(m => {
      if (!nextMeetingByDeal.has(m.deal_id)) nextMeetingByDeal.set(m.deal_id, m.start_time);
    });

    setRows(deals.map(d => ({
      ...d,
      current_status: statusByDeal.get(d.id) || null,
      last_contact: lastContactByDeal.get(d.id) || null,
      next_meeting: nextMeetingByDeal.get(d.id) || null,
    })));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    const timelineMs: Record<TimelineFilter, number | null> = {
      all: null, '7d': 7 * 86400000, '30d': 30 * 86400000, '90d': 90 * 86400000,
    };

    return rows.filter(d => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!d.deal_name.toLowerCase().includes(q) && !d.company_name.toLowerCase().includes(q)) return false;
      }

      if (stageFilter !== 'all' && d.deal_stage !== stageFilter) return false;

      if (statusFilter === 'active') {
        if (d.status !== 'active') return false;
      } else if (statusFilter !== 'all') {
        if (d.current_status !== statusFilter) return false;
      }

      const window = timelineMs[timelineFilter];
      if (window !== null) {
        const reference = d.last_contact || d.updated_at;
        if (now - new Date(reference).getTime() > window) return false;
      }

      return true;
    });
  }, [rows, search, stageFilter, statusFilter, timelineFilter]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="-mx-4 md:hidden">
        <TopBar
          title="Deals"
          action={
            <button
              onClick={() => navigate('/app/new')}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Plus className="w-4 h-4" />
            </button>
          }
        />
      </div>

      <div className="hidden md:flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-title1 font-bold text-textPrimary mb-1">Deals</h1>
          <p className="text-textSecondary text-subhead">All deals, filterable by timeline, stage, and status.</p>
        </div>
        <Button onClick={() => navigate('/app/new')}>
          <Plus className="w-4 h-4" /> New Deal
        </Button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deals or companies..."
            className="input-field pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3.5 rounded-lg border text-sm font-medium transition-colors',
            showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface border-border text-textSecondary'
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Timeline</label>
            <select
              value={timelineFilter}
              onChange={e => setTimelineFilter(e.target.value as TimelineFilter)}
              className="input-field text-sm"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Deal Stage</label>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value as DealStage | 'all')}
              className="input-field text-sm"
            >
              <option value="all">All stages</option>
              {DEAL_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Deal Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="input-field text-sm"
            >
              <option value="active">Active deals</option>
              <option value="all">All statuses</option>
              <option value="Healthy">Healthy</option>
              <option value="Promising">Promising</option>
              <option value="At Risk">At Risk</option>
              <option value="Critical">Critical</option>
              <option value="Stalled">Stalled</option>
              <option value="Recovering">Recovering</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-6 h-6" />}
          title={rows.length === 0 ? 'No deals yet' : 'No deals match your filters'}
          description={rows.length === 0
            ? 'Create your first deal to start tracking it with Kairo.'
            : 'Try adjusting your search or filters.'
          }
          action={rows.length === 0 ? <Button onClick={() => navigate('/app/new')}>New Deal</Button> : undefined}
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Deal Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Company</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Stage</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Value</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Last Contact</th>
                  <th className="px-5 py-3 text-xs font-semibold text-textMuted uppercase tracking-wide">Next Meeting</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/app/deals/${d.id}`)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-surfaceHigh transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-textPrimary">{d.deal_name}</td>
                    <td className="px-5 py-3.5 text-textSecondary">{d.company_name}</td>
                    <td className="px-5 py-3.5 text-textSecondary">{d.deal_stage}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                        style={getStatusStyle(d.current_status || 'Unknown')}
                      >
                        {d.current_status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-textSecondary">{formatValue(d.deal_value)}</td>
                    <td className="px-5 py-3.5 text-textSecondary">
                      {d.last_contact ? formatDate(d.last_contact) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-textSecondary">
                      {d.next_meeting ? formatDate(d.next_meeting) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {filtered.map(d => (
              <button
                key={d.id}
                onClick={() => navigate(`/app/deals/${d.id}`)}
                className="w-full card p-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-textPrimary text-sm font-semibold truncate">{d.deal_name}</p>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
                    style={getStatusStyle(d.current_status || 'Unknown')}
                  >
                    {d.current_status || 'Unknown'}
                  </span>
                </div>
                <p className="text-textSecondary text-xs mb-2">{d.company_name} · {d.deal_stage}</p>
                <div className="flex items-center justify-between text-xs text-textMuted">
                  <span>{formatValue(d.deal_value)}</span>
                  <span>{d.last_contact ? formatDate(d.last_contact) : 'No contact yet'}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}