import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  phase: 'analyzing' | 'recording';
}

const ANALYZING_MESSAGES = [
  'Reviewing the deal...',
  'Identifying the highest risk...',
  'Checking what\'s missing...',
  'Reading the evidence...',
  'Preparing your review...',
];

// For the Record Now flow: mobile-recording-review transcribes the audio
// first, then runs the same call-review extraction -- these messages
// cover both steps in one rotation, since the frontend can't observe the
// handoff between them mid-request.
const RECORDING_MESSAGES = [
  'Transcribing your call...',
  'Identifying the highest risk...',
  'Checking what\'s missing...',
  'Reading the evidence...',
  'Preparing your review...',
];

const TITLES: Record<LoadingStateProps['phase'], string> = {
  analyzing: 'Kairo is reviewing the deal',
  recording: 'Kairo is reviewing the call',
};

export function LoadingState({ phase }: LoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = phase === 'recording' ? RECORDING_MESSAGES : ANALYZING_MESSAGES;

  useEffect(() => {
    setMessageIndex(0);
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      {/* Spinner */}
      <div className="relative mb-8">
        <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2">
        <p className="text-textPrimary font-semibold font-display text-lg">
          {TITLES[phase]}
        </p>
        <p
          className="text-textSecondary text-sm animate-fade-in"
          key={messageIndex}
        >
          {messages[messageIndex]}
        </p>
      </div>

      {/* Dots */}
      <div className="flex gap-1.5 mt-8">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-soft"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </div>
    </div>
  );
}