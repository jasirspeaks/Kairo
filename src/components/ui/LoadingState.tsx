import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  phase: 'transcribing' | 'analyzing';
}

const ANALYZING_MESSAGES = [
  'Mapping conversation structure...',
  'Detecting psychological signals...',
  'Identifying trust shifts...',
  'Analyzing objection patterns...',
  'Building your coaching recommendations...',
  'Calculating conversation momentum...',
];

export function LoadingState({ phase }: LoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % ANALYZING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-8">
        <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse-soft" />
      </div>
      
      <div className="space-y-2">
        {phase === 'transcribing' ? (
          <>
            <p className="text-white font-semibold font-display text-lg">Transcribing your audio</p>
            <p className="text-textSecondary text-sm">Converting speech to text — this may take a moment</p>
          </>
        ) : (
          <>
            <p className="text-white font-semibold font-display text-lg">Analyzing conversation</p>
            <p className="text-textSecondary text-sm animate-fade-in" key={messageIndex}>
              {ANALYZING_MESSAGES[messageIndex]}
            </p>
          </>
        )}
      </div>

      <div className="flex gap-1.5 mt-8">
        {[0, 1, 2].map(i => (
          <div 
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </div>
    </div>
  );
}