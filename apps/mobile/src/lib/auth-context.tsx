import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
type State = { session: Session | null; loading: boolean; failed: boolean; recovery: boolean; finishRecovery(): void; retry(): void };
const Context = createContext<State>({ session: null, loading: true, failed: false, recovery: false, finishRecovery: () => {}, retry: () => {} });
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [failed, setFailed] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let authEvents = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, current) => {
      if (!active) return;
      if (event === 'INITIAL_SESSION') return;
      authEvents++;
      setSession(current);
      setFailed(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setLoading(false);
    });
    // Verify the restored identity with Auth rather than trusting storage alone.
    void client.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (data.session) {
        const verified = await client.auth.getUser();
        if (verified.error) {
          if (verified.error.status === 401 || verified.error.status === 403) await client.auth.signOut({ scope: 'local' });
          throw verified.error;
        }
      }
      if (active && authEvents === 0) { setSession(data.session); setLoading(false); }
    }).catch(() => { if (active && authEvents === 0) { setFailed(true); setSession(null); setLoading(false); } });
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', state => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    }) : null;
    if (Platform.OS !== 'web' && AppState.currentState === 'active') client.auth.startAutoRefresh();
    return () => { active = false; subscription.unsubscribe(); listener?.remove(); if (Platform.OS !== 'web') client.auth.stopAutoRefresh(); };
  }, [attempt]);
  return <Context.Provider value={{ session, loading, failed, recovery, finishRecovery: () => setRecovery(false), retry: () => { setFailed(false); setLoading(Boolean(supabase)); setAttempt(value => value + 1); } }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
