import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from './auth-context';
import { supabase } from './supabase';
import { sendMetric, setMetricPreference, type Metric } from './metrics';
type State = { enabled: boolean; ready: boolean; failed: boolean; retry(): void; setEnabled(enabled: boolean): Promise<void>; record(kind: Metric): void };
const Context = createContext<State>({ enabled: false, ready: false, failed: false, retry: () => {}, setEnabled: async () => {}, record: () => {} });
export function MetricsProvider({ children }: PropsWithChildren) {
 const { session } = useAuth();
 const [preference, update] = useState<{ owner: string; enabled: boolean } | null>(null);
 const [attempt, setAttempt] = useState(0);
 const [failed, setFailed] = useState(false); const choice = useRef(0);
 const owner = useRef(session?.user.id); owner.current = session?.user.id;
 useEffect(() => {
  let active = true; update(null);setFailed(false);const version=choice.current;
  if (session && supabase) void supabase.rpc('s11_metrics_enabled').then(({ data, error }) => {
   if (active && choice.current===version) {setFailed(Boolean(error));if(!error)update({ owner: session.user.id, enabled: data === true });}
  });
  return () => { active = false; };
 }, [session?.user.id, attempt]);
 const ready = Boolean(session && preference?.owner === session.user.id);
 const enabled = ready && preference?.enabled === true;
 async function setEnabled(next: boolean) {
  if (!session || !supabase) throw Error('Authentication required');
  const caller = session.user.id;
  const version=++choice.current;
  await setMetricPreference(next, session);
  if (owner.current === caller && choice.current===version) {update({ owner: caller, enabled: next });setFailed(false);}
 }
 const record = useCallback((kind: Metric) => {
  if (enabled && session && owner.current === session.user.id) void sendMetric(kind, session);
 }, [enabled, session]);
 return <Context.Provider value={{ enabled, ready, failed, retry: () => {choice.current++;setAttempt(v => v + 1);}, setEnabled, record }}>{children}</Context.Provider>;
}
export const useMetrics = () => useContext(Context);
