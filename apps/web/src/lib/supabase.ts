import { createClient } from '@supabase/supabase-js';

export const supabaseUrl: string =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.REACT_APP_SUPABASE_URL)) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_URL) ||
  '';

export const supabaseAnonKey: string =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.REACT_APP_SUPABASE_ANON_KEY)) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SUPABASE_ANON_KEY) ||
  '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);