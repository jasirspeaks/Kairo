import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-accent mb-5">
        {icon}
      </div>
      <h3 className="text-lg font-semibold font-display text-white mb-2">{title}</h3>
      <p className="text-textSecondary text-sm max-w-sm leading-relaxed mb-6">{description}</p>
      {action}
    </div>
  );
}