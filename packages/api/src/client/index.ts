import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';

export type KairoClient = SupabaseClient;

export interface KairoClientOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authStorage?: SupportedStorage;
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

let activeClient: KairoClient | null = null;
let activeUrl: string = '';
let activeAnonKey: string = '';

function getEnv(key: string): string {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!;
  }
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (typeof val === 'string') return val;
    }
  } catch {
    // Ignore
  }
  return '';
}

export function getClientConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  if (activeUrl && activeAnonKey) {
    return { supabaseUrl: activeUrl, supabaseAnonKey: activeAnonKey };
  }

  // Check static access on import.meta.env first so Vite can inline variables during build
  let metaUrl = '';
  let metaKey = '';
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const env = (import.meta as any).env;
      metaUrl =
        env.EXPO_PUBLIC_SUPABASE_URL ||
        env.VITE_SUPABASE_URL ||
        env.REACT_APP_SUPABASE_URL ||
        '';
      metaKey =
        env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        env.VITE_SUPABASE_ANON_KEY ||
        env.REACT_APP_SUPABASE_ANON_KEY ||
        '';
    }
  } catch {
    // Ignore
  }

  // Check static access on process.env for Expo/Metro and Node.js
  let procUrl = '';
  let procKey = '';
  if (typeof process !== 'undefined' && process.env) {
    procUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.REACT_APP_SUPABASE_URL ||
      '';
    procKey =
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.REACT_APP_SUPABASE_ANON_KEY ||
      '';
  }

  const url =
    metaUrl ||
    procUrl ||
    getEnv('EXPO_PUBLIC_SUPABASE_URL') ||
    getEnv('VITE_SUPABASE_URL') ||
    getEnv('REACT_APP_SUPABASE_URL') ||
    '';

  const key =
    metaKey ||
    procKey ||
    getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
    getEnv('VITE_SUPABASE_ANON_KEY') ||
    getEnv('REACT_APP_SUPABASE_ANON_KEY') ||
    '';

  return { supabaseUrl: url, supabaseAnonKey: key };
}

export function createKairoClient(options?: KairoClientOptions): KairoClient {
  const defaults = getClientConfig();
  const supabaseUrl = options?.supabaseUrl || defaults.supabaseUrl;
  const supabaseAnonKey = options?.supabaseAnonKey || defaults.supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Kairo Supabase client initialized without supabaseUrl or supabaseAnonKey.'
    );
  }

  const clientOptions: SupabaseClientOptions<'public'> = {
    auth: {
      persistSession: options?.persistSession ?? true,
      autoRefreshToken: options?.autoRefreshToken ?? true,
      detectSessionInUrl: options?.detectSessionInUrl ?? true,
    },
  };

  if (options?.authStorage) {
    clientOptions.auth!.storage = options.authStorage;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, clientOptions);
  activeClient = client;
  activeUrl = supabaseUrl;
  activeAnonKey = supabaseAnonKey;
  return client;
}

export function getKairoClient(): KairoClient {
  if (!activeClient) {
    activeClient = createKairoClient();
  }
  return activeClient;
}

export function setKairoClient(client: KairoClient): void {
  activeClient = client;
}

export const getSupabase = getKairoClient;

export const supabase: KairoClient = new Proxy({} as KairoClient, {
  get(_target, prop) {
    return (getKairoClient() as any)[prop];
  },
});
