import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { sessionStorage } from './session-storage';
import type { Database } from './database.types';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient<Database>(url, key, {
  auth: {
    storage: sessionStorage, storageKey: 'event-radar-auth',
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: false
  }
}) : null;
