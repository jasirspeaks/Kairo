import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  phase: 'analyzing';
}

const MESSAGES = [
  'Reviewing the deal...',
  'Identifying the highest risk...',
  'Checking what\'s missing...',
  'Reading the evidence...',
  'Preparing your review...',
];

export function LoadingState({ phase }: LoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

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
          Kairo is reviewing the deal
        </p>
        <p
          className="text-textSecondary text-sm animate-fade-in"
          key={messageIndex}
        >
          {MESSAGES[messageIndex]}
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