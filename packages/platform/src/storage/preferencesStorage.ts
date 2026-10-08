import {
  KairoLocalPreferences,
  DEFAULT_LOCAL_PREFERENCES,
} from '@kairo/core';
import { localStorageAdapter } from './localStorageAdapter';

const PREFERENCES_STORAGE_KEY = 'kairo_user_preferences_v1';

export function loadLocalPreferences(): KairoLocalPreferences {
  try {
    const raw = localStorageAdapter.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      intelligence: {
        ...DEFAULT_LOCAL_PREFERENCES.intelligence,
        ...(parsed.intelligence || {}),
      },
      capture: {
        ...DEFAULT_LOCAL_PREFERENCES.capture,
        ...(parsed.capture || {}),
      },
      notifications: {
        ...DEFAULT_LOCAL_PREFERENCES.notifications,
        ...(parsed.notifications || {}),
      },
    };
  } catch (err) {
    console.warn('[PreferencesStorage] Failed to read preferences, using defaults:', err);
    return DEFAULT_LOCAL_PREFERENCES;
  }
}

export function saveLocalPreferences(prefs: KairoLocalPreferences): void {
  try {
    localStorageAdapter.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[PreferencesStorage] Failed to save preferences:', err);
  }
}

export function updateLocalPreferences(
  patch: Partial<KairoLocalPreferences>
): KairoLocalPreferences {
  const current = loadLocalPreferences();
  const next: KairoLocalPreferences = {
    intelligence: {
      ...current.intelligence,
      ...(patch.intelligence || {}),
    },
    capture: {
      ...current.capture,
      ...(patch.capture || {}),
    },
    notifications: {
      ...current.notifications,
      ...(patch.notifications || {}),
    },
  };
  saveLocalPreferences(next);
  return next;
}
