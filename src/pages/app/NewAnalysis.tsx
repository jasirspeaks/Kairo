import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Mic, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { analyzeConversation } from '../../lib/anthropic';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { cn } from '../../lib/utils';

type InputMode = 'transcript' | 'audio';
type Phase = 'idle' | 'transcribing' | 'analyzing';

export function NewAnalysis() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<InputMode>('transcript');
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ACCEPTED = '.mp3,.mp4,.m4a,.wav';

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setAudioFile(file);
  }

  async function handleSubmit() {
    if (!user) return;

    // Validate transcript
    const textToAnalyze = transcript.trim();

    if (mode === 'transcript' && !textToAnalyze) {
      setError('Please paste a transcript before analyzing.');
      return;
    }

    if (mode === 'audio' && !audioFile && !textToAnalyze) {
      setError('Please upload an audio file or paste a transcript.');
      return;
    }

    if (textToAnalyze.length < 100) {
      setError('Your transcript is too short. Please provide a more complete conversation — at least a few exchanges.');
      return;
    }

    if (textToAnalyze.length > 50000) {
      setError('Your transcript is too long. Please trim it to under 50,000 characters.');
      return;
    }

    setPhase(mode === 'audio' ? 'transcribing' : 'analyzing');
    setError('');

    try {
      let finalTranscript = textToAnalyze;

      if (mode === 'audio') {
        await new Promise(r => setTimeout(r, 2000));
        setPhase('analyzing');
        finalTranscript = textToAnalyze;
      }

      setPhase('analyzing');

      // Create conversation record
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: title.trim() || `Conversation ${new Date().toLocaleDateString()}`,
          input_type: mode,
          transcript: finalTranscript,
          status: 'analyzing',
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to create conversation record.');

      // Run AI analysis via Edge Function
      const analysis = await analyzeConversation(finalTranscript);

      // Update with results
      await supabase.from('conversations').update({
        analysis_json: analysis,
        overall_score: analysis.overall_score,
        sub_scores: analysis.sub_scores,
        status: 'complete',
      }).eq('id', conv.id);

      navigate(`/app/analysis/${conv.id}`);

    } catch (err: any) {
      // If analysis fails, mark conversation as error
      setError(err.message || 'Analysis failed. Please try again.');
      setPhase('idle');
    }
  }

  if (phase !== 'idle') {
    return (
      <div className="min-h-[calc(100vh-64px)]">
        <LoadingState phase={phase === 'transcribing' ? 'transcribing' : 'analyzing'} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white mb-2">New Analysis</h1>
        <p className="text-textSecondary text-sm">Upload a recording or paste a transcript to begin your conversation intelligence report.</p>
      </div>

      {/* Conversation title */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-textSecondary mb-1.5">Conversation Title <span className="text-textMuted">(optional)</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Discovery call with TechCorp"
          className="input-field max-w-xl"
        />
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 bg-surfaceHigh border border-border rounded-xl w-fit mb-6">
        {(['transcript', 'audio'] as InputMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              mode === m 
                ? 'bg-primary text-white shadow-purple-glow-sm'
                : 'text-textSecondary hover:text-white'
            )}
          >
            {m === 'transcript' ? <FileText className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {m === 'transcript' ? 'Paste Transcript' : 'Upload Audio'}
          </button>
        ))}
      </div>

      {/* Input Area */}
      {mode === 'transcript' ? (
        <div className="mb-6">
          <label className="block text-xs font-medium text-textSecondary mb-1.5">Sales Call Transcript</label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder={`Paste your full conversation transcript here.\n\nExample:\nRep: Thanks for taking the time today. How are things going at Acme?\nProspect: Pretty well, though we're dealing with some pipeline issues...\n\nThe more complete your transcript, the deeper the analysis.`}
            className="input-field min-h-64 resize-y font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-textMuted mt-2">
            {transcript.length > 0 ? `${transcript.split(/\s+/).filter(Boolean).length} words` : 'Include speaker labels for better analysis (e.g. "Rep:" or "Prospect:")'}
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200',
              isDragging 
                ? 'border-accent bg-accent/5' 
                : audioFile
                ? 'border-emerald-400/40 bg-emerald-400/5'
                : 'border-border hover:border-accent/40 hover:bg-surfaceHigh/50'
            )}
          >
            <input 
              ref={fileRef} 
              type="file" 
              accept={ACCEPTED} 
              className="hidden"
              onChange={e => setAudioFile(e.target.files?.[0] || null)} 
            />
            
            {audioFile ? (
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-3">
                  <Mic className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-white font-medium text-sm mb-1">{audioFile.name}</p>
                <p className="text-textMuted text-xs">{(audioFile.size / 1024 / 1024).toFixed(1)} MB · Ready to analyze</p>
                <button 
                  onClick={e => { e.stopPropagation(); setAudioFile(null); }}
                  className="mt-3 text-xs text-red-400 hover:text-red-300"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <div className="w-12 h-12 rounded-xl bg-surfaceHigh border border-border flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-textMuted" />
                </div>
                <p className="text-white font-medium text-sm mb-1">Drop your audio file here</p>
                <p className="text-textMuted text-xs mb-3">or click to browse</p>
                <div className="flex gap-2 justify-center">
                  {['MP3', 'MP4', 'M4A', 'WAV'].map(f => (
                    <span key={f} className="text-xs text-textMuted bg-surfaceHigh border border-border px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* For MVP: also show transcript field for audio */}
          <div className="mt-4 p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-xs font-medium">MVP Note</p>
              <p className="text-textMuted text-xs mt-0.5">For the validation MVP, please also paste the transcript below. Whisper API transcription is the next integration step.</p>
            </div>
          </div>
          
          <div className="mt-3">
            <label className="block text-xs font-medium text-textSecondary mb-1.5">Transcript (paste alongside audio)</label>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste transcript here..."
              className="input-field min-h-32 font-mono text-xs"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        size="lg"
        disabled={(mode === 'transcript' && !transcript.trim()) || (mode === 'audio' && !audioFile && !transcript.trim())}
        className="min-w-48"
      >
        Analyze Conversation
      </Button>
    </div>
  );
}