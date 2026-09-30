import { getKairoClient, getClientConfig } from '@kairo/api';

const config = getClientConfig();
export const supabaseUrl: string = config.supabaseUrl;
export const supabaseAnonKey: string = config.supabaseAnonKey;
export const supabase = getKairoClient();