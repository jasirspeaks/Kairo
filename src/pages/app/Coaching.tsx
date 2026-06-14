import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Conversation } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';

export function Coaching() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('conversations').select('*').eq('user_id', user.id).eq('status', 'complete')
      .then(({ data }) => { setConversations(data || []); setLoading(false); });
  }, [user]);

  const allCoaching = conversations.flatMap(c => c.analysis_json?.coaching || []);

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Your Coaching Plan</h1>
        <p className="text-textSecondary text-sm">Personalized improvement recommendations built from your real conversation history.</p>
      </div>

      {allCoaching.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="Your coaching plan is building"
          description="Analyze your first conversation and Kairo will generate personalized coaching recommendations tied to what you actually said and how buyers responded."
        />
      ) : (
        <div className="space-y-4">
          {allCoaching.map((item, i) => (
            <div key={i} className="card p-5 border-l-2 border-primary">
              <p className="text-accent text-xs font-semibold mb-3">{item.moment}</p>
              <div className="space-y-3">
                <div className="bg-red-400/5 border border-red-400/15 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-400 mb-1">What went wrong</p>
                  <p className="text-xs text-textSecondary">{item.problem}</p>
                </div>
                <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-lg p-3">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">Better approach</p>
                  <p className="text-xs text-textSecondary">{item.better_approach}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}