import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  accent?: 'default' | 'red' | 'amber' | 'emerald';
  children: React.ReactNode;
}

export function CollapsibleSection({
  title, count, defaultOpen = false, accent = 'default', children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const accentText = {
    default: 'text-textPrimary',
    red: 'text-red-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
  }[accent];

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 min-h-[52px] active:bg-surfaceHigh"
      >
        <span className={cn('text-sm font-semibold', accentText)}>
          {title}
          {typeof count === 'number' && (
            <span className="ml-1.5 text-textMuted font-normal">({count})</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-textMuted transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0 border-t border-border animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}