import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mic, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Conversation } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScoreBadge } from '../../components/ui/ScoreBadge';
import { formatDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setConversations(data || []); setLoading(false); });
  }, [user]);

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white mb-1">
            {greeting}, {profile?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-textSecondary text-sm">
            {conversations.length === 0 
              ? 'Your conversation intelligence workspace is ready.'
              : `You have ${conversations.length} analyzed conversation${conversations.length !== 1 ? 's' : ''}.`
            }
          </p>
        </div>
        <Button onClick={() => navigate('/app/new')} size="lg">
          <Plus className="w-4 h-4" />
          New Analysis
        </Button>
      </div>

      {/* Stats row */}
      {conversations.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4">
            <p className="section-label mb-1">Total Analyzed</p>
            <p className="text-2xl font-display font-bold text-white">{conversations.length}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Average Score</p>
            <p className="text-2xl font-display font-bold text-white">
              {Math.round(conversations.filter(c => c.overall_score).reduce((a, c) => a + (c.overall_score || 0), 0) / conversations.filter(c => c.overall_score).length) || '—'}
            </p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">This Week</p>
            <p className="text-2xl font-display font-bold text-white">
              {conversations.filter(c => {
                const date = new Date(c.created_at);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return date > weekAgo;
              }).length}
            </p>
          </div>
        </div>
      )}

      {/* Conversations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-label">Recent Conversations</h2>
          {conversations.length > 0 && (
            <button onClick={() => navigate('/app/history')} className="text-xs text-accent hover:text-white transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-4 bg-surfaceHigh rounded w-1/3 mb-2" />
                <div className="h-3 bg-surfaceHigh rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No conversations yet"
            description="Upload your first call recording or paste a transcript to begin your conversation intelligence report."
            action={
              <Button onClick={() => navigate('/app/new')}>
                <Plus className="w-4 h-4" />
                Analyze Your First Conversation
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => navigate(`/app/analysis/${conv.id}`)}
                className="card-hover w-full p-4 flex items-center gap-4 text-left group"
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  conv.input_type === 'audio' 
                    ? 'bg-purple-400/10 border border-purple-400/20'
                    : 'bg-blue-400/10 border border-blue-400/20'
                )}>
                  {conv.input_type === 'audio' 
                    ? <Mic className="w-4 h-4 text-purple-400" />
                    : <FileText className="w-4 h-4 text-blue-400" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {conv.title || 'Untitled Conversation'}
                  </p>
                  <p className="text-textMuted text-xs mt-0.5">
                    {formatDate(conv.created_at)} · {conv.input_type === 'audio' ? 'Audio recording' : 'Transcript'}
                    {conv.status !== 'complete' && (
                      <span className="ml-2 text-amber-400">Processing...</span>
                    )}
                  </p>
                </div>

                {conv.overall_score && (
                  <ScoreBadge score={conv.overall_score} />
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