import React from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-textPrimary/20 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:right-auto md:bottom-auto
                   md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg
                   bg-surface rounded-t-2xl md:rounded-2xl shadow-sheet
                   max-h-[88vh] md:max-h-[85vh] overflow-y-auto pb-safe-b
                   animate-sheet-up md:animate-slide-up"
      >
        {/* Drag handle - mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-6 pt-2 pb-4">
          <h2 className="text-lg font-display font-bold text-textPrimary">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surfaceHigh text-textMuted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}