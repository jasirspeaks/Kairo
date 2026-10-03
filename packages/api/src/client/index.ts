import {
  createClient,
  SupabaseClient,
  SupportedStorage,
  SupabaseClientOptions,
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

export function getClientConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  if (activeUrl && activeAnonKey) {
    return { supabaseUrl: activeUrl, supabaseAnonKey: activeAnonKey };
  }

  const metaEnv = typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    : undefined;

  const url: string =
    metaEnv?.VITE_SUPABASE_URL ||
    metaEnv?.REACT_APP_SUPABASE_URL ||
    (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_URL) ||
    '';

  const key: string =
    metaEnv?.VITE_SUPABASE_ANON_KEY ||
    metaEnv?.REACT_APP_SUPABASE_ANON_KEY ||
    (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_ANON_KEY) ||
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
