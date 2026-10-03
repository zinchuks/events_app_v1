import type { Session } from '@supabase/supabase-js';
export type Metric = 'rule_created' | 'digest_opened' | 'event_saved' | 'organizer_opened' | 'purchase';
export async function setMetricPreference(enabled: boolean, session: Session): Promise<boolean> {
 const url = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
 if (!url || !key) throw Error('Unavailable');
 const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
 try {
  const response = await fetch(`${url}/rest/v1/rpc/set_s11_metrics`, {
   method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ enabled }), signal: controller.signal
  });
  if (!response.ok) throw Error('Preference unavailable');
  const value: unknown = await response.json(); if (value !== enabled) throw Error('Preference unavailable');
  return value;
 } finally { clearTimeout(timer); }
}
// A captured bearer prevents a delayed action from being attributed to the next logged-in owner.
// No persistence, retries, payload properties, device/location identifiers or external analytics SDK.
export async function sendMetric(kind: Metric, session: Session): Promise<void> {
 const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
 const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
 if (!url || !key) return;
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 5000);
 try {
  await fetch(`${url}/rest/v1/rpc/record_s11_metric`, {
   method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ kind }), signal: controller.signal
  });
 } catch { /* Metrics never block a product action; no logs of credentials or payloads. */ }
 finally { clearTimeout(timer); }
}
