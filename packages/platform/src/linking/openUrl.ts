import { OpenUrlOptions } from '../types';

export function openUrl(url: string, options?: OpenUrlOptions): void {
  if (typeof window === 'undefined') return;

  if (options?.target === '_self') {
    window.location.assign(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
