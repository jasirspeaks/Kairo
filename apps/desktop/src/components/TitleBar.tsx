import React from 'react';
import { Sparkles } from 'lucide-react';

export function TitleBar({
  isConnected = true,
  currentVersion = '0.1.0',
  updateAvailable = false,
  isCheckingUpdate = false,
  onCheckUpdate,
}: {
  isConnected?: boolean;
  currentVersion?: string;
  updateAvailable?: boolean;
  isCheckingUpdate?: boolean;
  onCheckUpdate?: () => void;
}) {
  return (
    <div
      data-tauri-drag-region
      className="h-9 bg-surface border-b border-border/70 flex items-center justify-between px-3 text-xs font-medium text-textMuted select-none cursor-default z-50 flex-shrink-0"
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center pointer-events-none">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
        <span className="font-semibold text-textPrimary tracking-tight pointer-events-none">Kairo</span>
        <button
          onClick={onCheckUpdate}
          title={isCheckingUpdate ? 'Checking for updates...' : updateAvailable ? 'Update available - click to check' : `Kairo Desktop v${currentVersion} (Click to check for updates)`}
          className="flex items-center gap-1.5 text-[10px] text-textMuted font-mono bg-surfaceHigh hover:bg-surfaceHigh/80 hover:text-textSecondary px-1.5 py-0.5 rounded border border-border transition-colors"
        >
          <span>v{currentVersion}</span>
          {updateAvailable && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
        </button>
      </div>

      <div className="flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 text-[11px] text-textSecondary bg-surfaceHigh/60 px-2 py-0.5 rounded-full border border-border/60">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span>{isConnected ? 'Connected' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
}
