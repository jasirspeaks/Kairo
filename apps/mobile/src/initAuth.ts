import AsyncStorage from '@react-native-async-storage/async-storage';
import { createKairoClient, getKairoClient } from '@kairo/api';

/**
 * Initializes the Supabase client specifically for React Native / Expo:
 * - Persistent native storage via AsyncStorage
 * - detectSessionInUrl: false (no window.location assumptions)
 * - autoRefreshToken: true
 * - persistSession: true
 */
export function initMobileClient() {
  return createKairoClient({
    authStorage: AsyncStorage,
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  });
}

// Auto-initialize when this module is imported
initMobileClient();

export { getKairoClient };
