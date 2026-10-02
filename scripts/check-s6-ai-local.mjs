// Read-only operator status; loopback only. No credentials/raw error bodies printed.
import { localClients } from './lib/local-clients.mjs';
const { admin } = localClients();
const day = new Date().toISOString().slice(0, 10);
const results = await Promise.allSettled([
 admin.from('s6_ai_settings').select('enabled,provider,model_id,prompt_version,locales,currency,daily_limit,request_ceiling,pricing_verified_at').single(),
 admin.from('s6_ai_days').select('currency,committed').eq('day', day),
 admin.from('s6_ai_requests').select('id', { count: 'exact', head: true }),
]);
for (const result of results) if (result.status !== 'fulfilled' || result.value.error) throw Error('Local AI status unavailable');
const [settings, budgets, requests] = results.map(result => result.value);
console.log(JSON.stringify({ settings: settings.data, utc_day: day, budgets: budgets.data, request_count: requests.count,
 provider_adapter: 'not implemented; requires actual provider/model/pricing/access', paid_requests_from_this_command: 0 }));
