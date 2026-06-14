import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Conversation } from '../../types';
import { ScoreBadge } from '../../components/ui/ScoreBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

export function History() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'audio' | 'transcript'>('all');

  useEffect(() => {
    if (!user) return;
    supabase.from('conversations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setConversations(data || []); setLoading(false); });
  }, [user]);

  const filtered = filter === 'all' ? conversations : conversations.filter(c => c.input_type === filter);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white mb-1">Conversation History</h1>
          <p className="text-textSecondary text-sm">All your analyzed conversations in one place.</p>
        </div>
        <div className="flex gap-1 p-1 bg-surfaceHigh border border-border rounded-xl">
          {(['all', 'transcript', 'audio'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              filter === f ? 'bg-primary text-white' : 'text-textSecondary hover:text-white'
            )}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No conversations found"
          description="Analyze conversations to build your history."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(conv => (
            <button key={conv.id} onClick={() => navigate(`/app/analysis/${conv.id}`)}
              className="card-hover w-full flex items-center gap-4 p-4 text-left group">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                conv.input_type === 'audio' ? 'bg-purple-400/10 border border-purple-400/20' : 'bg-blue-400/10 border border-blue-400/20')}>
                {conv.input_type === 'audio' ? <Mic className="w-4 h-4 text-purple-400" /> : <FileText className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{conv.title || 'Untitled'}</p>
                <p className="text-textMuted text-xs">{formatDate(conv.created_at)}</p>
              </div>
              {conv.overall_score && <ScoreBadge score={conv.overall_score} />}
              <ArrowRight className="w-4 h-4 text-textMuted group-hover:text-accent transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}