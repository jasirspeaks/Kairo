import { useState, useEffect, useCallback, useRef } from 'react';
import { isTauriEnvironment } from '@kairo/platform';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'installing'
  | 'error';

export interface UseDesktopUpdaterReturn {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadProgress: number | null;
  errorMessage: string | null;
  dismissed: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissBanner: () => void;
}

export function useDesktopUpdater(): UseDesktopUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string>('0.1.0');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const updateRef = useRef<any>(null);
  const isCheckingRef = useRef<boolean>(false);

  const checkForUpdates = useCallback(
    async (manual: boolean = false) => {
      if (!isTauriEnvironment() || isCheckingRef.current) return;

      isCheckingRef.current = true;
      setStatus('checking');
      setErrorMessage(null);

      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (update) {
          updateRef.current = update;
          setCurrentVersion(update.currentVersion || '0.1.0');
          setAvailableVersion(update.version);
          setStatus('available');
          setDismissed(false);
        } else {
          if (updateRef.current) {
            try {
              await updateRef.current.close();
            } catch {
              // Ignore close error
            }
            updateRef.current = null;
          }
          setStatus('up-to-date');
          setAvailableVersion(null);
        }
      } catch (err: any) {
        console.warn('[DesktopUpdater] Update check failed:', err);
        if (manual) {
          setStatus('error');
          setErrorMessage('Unable to check for updates right now. Please check your internet connection.');
        } else {
          // In silent startup check, quietly return to idle without annoying user
          setStatus('idle');
        }
      } finally {
        isCheckingRef.current = false;
      }
    },
    []
  );

  const installUpdate = useCallback(async () => {
    if (!updateRef.current) return;

    setStatus('downloading');
    setErrorMessage(null);
    setDownloadProgress(0);

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await updateRef.current.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          totalBytes = event.data?.contentLength || 0;
          setStatus('downloading');
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data?.chunkLength || 0;
          if (totalBytes > 0) {
            const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            setDownloadProgress(pct);
          }
        } else if (event.event === 'Finished') {
          setStatus('installing');
        }
      });
    } catch (err: any) {
      console.error('[DesktopUpdater] Installation error:', err);
      setStatus('error');
      setErrorMessage('Failed to apply the update. Please try again later.');
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
  }, []);

  // Check once automatically 10 seconds after app startup
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    const timer = setTimeout(() => {
      checkForUpdates(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    status,
    currentVersion,
    availableVersion,
    downloadProgress,
    errorMessage,
    dismissed,
    checkForUpdates,
    installUpdate,
    dismissBanner,
  };
}
