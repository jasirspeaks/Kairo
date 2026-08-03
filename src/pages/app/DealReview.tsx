import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Phone, Calendar, TrendingUp, Users, Clock,
  ChevronRight, Building2, DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStatusStyle } from '../../lib/kairo';
import { Deal, DealState, Conversation, Stakeholder } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/layout/TopBar';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { formatDate } from '../../lib/utils';

// Deal Review is a pure read. deal_state is always current because
// call-review already computed it that way on the most recent call --
// there is no refresh action anywhere in this page or the product.

const SENTIMENT_LABEL: Record<string, string> = {
  champion: 'Champion',
  supporter: 'Supporter',
  neutral: 'Neutral',
  skeptic: 'Skeptic',
  blocker: 'Blocker',
};

const SENTIMENT_COLOR: Record<string, string> = {
  champion: '#3DD68C',
  supporter: '#4F8CFF',
  neutral: '#8B93A7',
  skeptic: '#F6B23E',
  blocker: '#FF667A',
};

function formatValue(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function healthScoreColor(score: number): string {
  if (score >= 70) return '#3DD68C';
  if (score >= 40) return '#F6B23E';
  return '#FF667A';
}

export function DealReview() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealState, setDealState] = useState<DealState | null>(null);
  const [calls, setCalls] = useState<Conversation[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [nextMeeting, setNextMeeting] = useState<{ start_time: string; title: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function fetchData() {
    setLoading(true);

    const [{ data: dealData }, { data: stateData }, { data: callsData }, { data: stakeholderData }, { data: meetingData }] =
      await Promise.all([
        supabase.from('deals').select('*').eq('id', dealId).single(),
        supabase.from('deal_state').select('*').eq('deal_id', dealId).maybeSingle(),
        supabase.from('conversations').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('stakeholders').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
        supabase.from('scheduled_meetings').select('start_time, title')
          .eq('deal_id', dealId).eq('status', 'assigned')
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true }).limit(1).maybeSingle(),
      ]);

    setDeal(dealData);
    setDealState(stateData);
    setCalls(callsData || []);
    setStakeholders(stakeholderData || []);
    setNextMeeting(meetingData || null);
    setLoading(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-t-primary border-border rounded-full animate-spin" />
    </div>
  );

  if (!deal) return (
    <EmptyState
      icon={<AlertTriangle className="w-6 h-6" />}
      title="Deal not found"
      description="This deal doesn't exist or you don't have access to it."
      action={<Button onClick={() => navigate('/app/deals')}>Back to Deals</Button>}
    />
  );

  if (!dealState || calls.length === 0) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="-mx-4 md:hidden">
          <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
        </div>
        <EmptyState
          icon={<Phone className="w-6 h-6" />}
          title="No calls yet"
          description="Add a call transcript to this deal to see Kairo's review of where things stand."
          action={<Button onClick={() => navigate('/app/new')}>Add a Call</Button>}
        />
      </div>
    );
  }

  const lastContact = calls[calls.length - 1]?.created_at;
  const healthColor = healthScoreColor(dealState.deal_health_score ?? 0);

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="-mx-4 md:hidden">
        <TopBar title={deal.deal_name} onBack={() => navigate('/app/deals')} />
      </div>

      {/* Always-visible summary */}
      <div className="card p-4 md:p-6 mb-4">
        <div className="hidden md:flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-display font-bold text-textPrimary mb-1">{deal.deal_name}</h1>
            <p className="text-textSecondary text-sm flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {deal.company_name}
            </p>
          </div>
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-full border"
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>

        <div className="flex md:hidden items-center justify-between mb-4">
          <p className="text-textSecondary text-sm">{deal.company_name}</p>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full border"
            style={getStatusStyle(dealState.current_status || 'Unknown')}
          >
            {dealState.current_status || 'Unknown'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="flex flex-col items-center md:items-start">
            <div className="relative w-16 h-16 mb-1">
              <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
                <circle
                  cx="32" cy="32" r="28" fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke={healthColor}
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - (dealState.deal_health_score ?? 0) / 100)}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-textPrimary">{dealState.deal_health_score ?? '—'}</span>
              </div>
            </div>
            <span className="text-xs text-textMuted">Health Score</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-textMuted" /> {formatValue(deal.deal_value)}
            </span>
            <span className="text-xs text-textMuted mt-0.5">Deal Value</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary">{deal.deal_stage}</span>
            <span className="text-xs text-textMuted mt-0.5">Deal Stage</span>
          </div>

          <div className="flex flex-col items-center md:items-start justify-center">
            <span className="text-sm font-semibold text-textPrimary">
              {lastContact ? formatDate(lastContact) : '—'}
            </span>
            <span className="text-xs text-textMuted mt-0.5">Last Contact</span>
          </div>
        </div>

        {nextMeeting && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-xs text-textSecondary">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            Next meeting: {nextMeeting.title || 'Scheduled call'} — {formatDate(nextMeeting.start_time)}
          </div>
        )}
      </div>

      {/* Primary insight cards */}
      <div className="space-y-3 md:space-y-4 mb-5">
        {dealState.highest_priority_risk_full?.risk && (
          <div className="card p-4 md:p-6 border border-red-200">
            <h2 className="section-label mb-3">Highest Priority Risk</h2>
            <p className="text-textPrimary text-sm font-semibold mb-3">
              {dealState.highest_priority_risk_full.risk}
            </p>
            {dealState.highest_priority_risk_full.why_it_matters && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs text-textMuted font-medium mb-1">Why it matters</p>
                <p className="text-textSecondary text-xs leading-relaxed">
                  {dealState.highest_priority_risk_full.why_it_matters}
                </p>
              </div>
            )}
          </div>
        )}

        {dealState.what_youre_missing && dealState.what_youre_missing.length > 0 && (
          <div className="card p-4 md:p-6">
            <h2 className="section-label mb-3">What's Still Missing</h2>
            <div className="space-y-3">
              {dealState.what_youre_missing.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-700 text-xs font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-textPrimary text-xs font-medium mb-1">{item.gap}</p>
                    <p className="text-primary text-xs">Ask: "{item.question_to_answer}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dealState.key_follow_up_message && (
          <div className="card p-4 md:p-6">
            <h2 className="section-label mb-2">Next Recommended Action</h2>
            <p className="text-textPrimary text-sm leading-relaxed">{dealState.key_follow_up_message}</p>
          </div>
        )}

        {dealState.manager_note && (
          <div className="bg-primary/8 border border-primary/15 rounded-xl px-5 py-4">
            <p className="text-xs text-primary font-semibold mb-1">Manager Note</p>
            <p className="text-textPrimary text-sm font-medium">{dealState.manager_note}</p>
          </div>
        )}
      </div>

      {/* Toggle-able sections */}
      <div className="space-y-3 md:space-y-4">

        {/* Timeline: every call, in order, newest first */}
        <CollapsibleSection title="Timeline" count={calls.length}>
          <div className="space-y-2 pt-4">
            {[...calls].reverse().map(call => {
              const callData = call.analysis_json?.call;
              return (
                <button
                  key={call.id}
                  onClick={() => navigate(`/app/deals/${dealId}/calls/${call.id}`)}
                  className="w-full flex items-center justify-between gap-3 bg-surfaceHigh border border-border rounded-lg px-4 py-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="min-w-0">
                    <p className="text-textPrimary text-xs font-medium truncate">
                      {call.title || formatDate(call.created_at)}
                    </p>
                    {callData?.verdict && (
                      <p className="text-textMuted text-xs truncate mt-0.5">{callData.verdict}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {callData?.call_status && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                        style={getStatusStyle(callData.call_status)}
                      >
                        {callData.call_status}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-textMuted" />
                  </div>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* Risk Evolution: what_changed_since_last_call across every call that has it */}
        <CollapsibleSection title="Risk Evolution">
          <div className="space-y-4 pt-4">
            {calls.filter(c => c.analysis_json?.what_changed_since_last_call).length === 0 ? (
              <p className="text-textMuted text-xs">
                Risk evolution appears once this deal has more than one call.
              </p>
            ) : (
              [...calls].reverse().map(call => {
                const changed = call.analysis_json?.what_changed_since_last_call;
                if (!changed) return null;
                const hasContent = changed.resolved.length || changed.persists.length || changed.new_risks.length;
                if (!hasContent) return null;

                return (
                  <div key={call.id} className="border-l-2 border-border pl-4">
                    <p className="text-xs font-semibold text-textPrimary mb-2 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-textMuted" />
                      {call.title || formatDate(call.created_at)}
                    </p>
                    <div className="space-y-2">
                      {changed.resolved.map((item, i) => (
                        <p key={`r-${i}`} className="text-xs text-emerald-600">✓ {item}</p>
                      ))}
                      {changed.persists.map((item, i) => (
                        <p key={`p-${i}`} className="text-xs text-amber-600">→ {item}</p>
                      ))}
                      {changed.new_risks.map((item, i) => (
                        <p key={`n-${i}`} className="text-xs text-red-600">! {item}</p>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleSection>

        {/* Stakeholders: accumulated across all calls via stakeholder_signals */}
        <CollapsibleSection title="Stakeholders" count={stakeholders.length}>
          <div className="space-y-2 pt-4">
            {stakeholders.length === 0 ? (
              <p className="text-textMuted text-xs">
                No stakeholders identified yet. They'll appear here as Kairo recognizes named people across your calls.
              </p>
            ) : (
              stakeholders.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-surfaceHigh border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-textPrimary text-xs font-medium truncate">{s.name}</p>
                      {s.role && <p className="text-textMuted text-xs truncate">{s.role}</p>}
                    </div>
                  </div>
                  {s.sentiment && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
                      style={{
                        color: SENTIMENT_COLOR[s.sentiment],
                        backgroundColor: `${SENTIMENT_COLOR[s.sentiment]}1A`,
                        borderColor: `${SENTIMENT_COLOR[s.sentiment]}4D`,
                      }}
                    >
                      {SENTIMENT_LABEL[s.sentiment]}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* Deal Activity */}
      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => navigate('/app/new')}>
          <TrendingUp className="w-4 h-4" /> Log Activity
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => navigate('/app/inbox')}>
          <Calendar className="w-4 h-4" /> Schedule Next Meeting
        </Button>
      </div>
    </div>
  );
}