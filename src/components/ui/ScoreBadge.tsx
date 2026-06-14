import React from 'react';
import { cn, getScoreBg } from '../../lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={cn(
      'inline-flex items-center font-semibold rounded-full border',
      getScoreBg(score),
      sizes[size]
    )}>
      {score}
    </span>
  );
}