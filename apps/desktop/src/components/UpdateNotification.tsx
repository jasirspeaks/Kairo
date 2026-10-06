import React from 'react';
import { ArrowDownCircle, RefreshCw, X, AlertCircle } from 'lucide-react';
import { UseDesktopUpdaterReturn } from '../hooks/useDesktopUpdater';

interface UpdateNotificationProps {
  updater: UseDesktopUpdaterReturn;
}

export function UpdateNotification({ updater }: UpdateNotificationProps) {
  const {
    status,
    availableVersion,
    downloadProgress,
    errorMessage,
    dismissed,
    installUpdate,
    dismissBanner,
  } = updater;

  if (dismissed || status === 'idle' || status === 'checking' || status === 'up-to-date') {
    return null;
  }

  return (
    <aside
      aria-label="Application update"
      className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-[#160D21] border border-[#302044] shadow-2xl shadow-black/80 rounded-xl p-4 text-[#F7F2FC] animate-fade-in transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#7042C5]/20 border border-[#7042C5]/40 flex items-center justify-center flex-shrink-0 text-[#BFA3E8]">
            {status === 'downloading' || status === 'installing' ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[#BFA3E8]" />
            ) : status === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <ArrowDownCircle className="w-4 h-4 text-[#BFA3E8]" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-[#F7F2FC]">
              {status === 'available' && `Kairo ${availableVersion} is ready`}
              {status === 'downloading' && (downloadProgress !== null ? `Downloading update (${downloadProgress}%)` : 'Downloading update...')}
              {status === 'installing' && 'Applying update...'}
              {status === 'error' && 'Update check'}
            </h4>
            <p className="text-[11px] text-[#B4A7C2] mt-0.5 leading-snug">
              {status === 'available' && 'A new version of Kairo is available to install.'}
              {status === 'downloading' && 'Fetching signed release assets.'}
              {status === 'installing' && 'Kairo will restart momentarily.'}
              {status === 'error' && (errorMessage || 'Could not verify update package.')}
            </p>
          </div>
        </div>

        {status === 'available' && (
          <button
            onClick={dismissBanner}
            className="text-[#B4A7C2] hover:text-[#F7F2FC] transition-colors p-1"
            title="Later"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {status === 'downloading' && downloadProgress !== null && (
        <div className="w-full bg-[#211333] h-1.5 rounded-full mt-3 overflow-hidden border border-[#302044]">
          <div
            className="bg-[#7042C5] h-full transition-all duration-200"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      )}

      {status === 'available' && (
        <div className="flex items-center gap-2 mt-3.5 pt-2 border-t border-[#302044]/60">
          <button
            onClick={installUpdate}
            className="flex-1 bg-[#7042C5] hover:bg-[#8050D9] text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors shadow-sm"
          >
            Update now
          </button>
          <button
            onClick={dismissBanner}
            className="text-xs text-[#B4A7C2] hover:text-[#F7F2FC] py-1.5 px-3 rounded-lg transition-colors"
          >
            Later
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#302044]/60">
          <button
            onClick={dismissBanner}
            className="text-xs text-[#B4A7C2] hover:text-[#F7F2FC] py-1 px-2 rounded transition-colors ml-auto"
          >
            Dismiss
          </button>
        </div>
      )}
    </aside>
  );
}
