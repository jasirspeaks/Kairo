import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Conversation } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';

export function Patterns() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('conversations').select('*').eq('user_id', user.id).eq('status', 'complete')
      .then(({ data }) => { setConversations(data || []); setLoading(false); });
  }, [user]);

  // Extract patterns from completed conversations
  const allWeaknesses: string[] = [];
  const allStrengths: string[] = [];
  const allObjections: string[] = [];

  conversations.forEach(conv => {
    if (!conv.analysis_json) return;
    const a = conv.analysis_json;
    a.insights.weak_moments.forEach(i => allWeaknesses.push(i.point));
    a.insights.communication_strengths.forEach(i => allStrengths.push(i.point));
    a.insights.objection_moments.forEach(i => allObjections.push(i.point));
  });

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Pattern Intelligence</h1>
        <p className="text-textSecondary text-sm">
          Recurring signals detected across {conversations.length} analyzed conversation{conversations.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {conversations.length < 2 ? (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6" />}
          title="Patterns emerge over time"
          description="Analyze at least 2 conversations and Kairo will begin identifying recurring signals, habits, and patterns in your sales communication."
        />
      ) : (
        <div className="grid gap-6">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Recurring Weaknesses</h2>
              <span className="text-xs text-textMuted ml-auto">{allWeaknesses.length} occurrences</span>
            </div>
            <div className="space-y-2">
              {allWeaknesses.slice(0, 5).map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-textSecondary border-l-2 border-amber-400/30 pl-3 py-1">
                  {w}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Consistent Strengths</h2>
              <span className="text-xs text-textMuted ml-auto">{allStrengths.length} occurrences</span>
            </div>
            <div className="space-y-2">
              {allStrengths.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-textSecondary border-l-2 border-emerald-400/30 pl-3 py-1">
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Common Objections Faced</h2>
            </div>
            <div className="space-y-2">
              {allObjections.slice(0, 5).map((o, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-textSecondary border-l-2 border-red-400/30 pl-3 py-1">
                  {o}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}