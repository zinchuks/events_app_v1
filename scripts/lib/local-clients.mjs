import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
export function localClients({timeoutMs}={}) {
 const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
 if (status.API_URL !== 'http://127.0.0.1:54321') throw Error('Local stack required');
 const options = { auth: { persistSession: false, autoRefreshToken: false },
  ...(timeoutMs ? {global:{fetch:(input,init={})=>fetch(input,{...init,signal:init.signal
   ? AbortSignal.any([init.signal,AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)})}} : {}) };
 return { admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, options), client: () => createClient(status.API_URL, status.ANON_KEY, options) };
}
