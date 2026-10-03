import { pollS6Sources } from './s6-polling.mjs';
import { rpc, processS7Job, checkS7Receipts } from './s7-worker.mjs';
import { reconcileOne } from './s9-revenuecat.mjs';
export function stagingConfig(env) {
 if (env.APP_ENV !== 'staging') throw Error('Explicit staging environment required');
 let endpoint; try { endpoint = new URL(env.SUPABASE_URL); } catch { throw Error('Hosted staging API required'); }
 if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
  !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) || endpoint.hostname !== env.STAGING_SUPABASE_HOST) throw Error('Explicit hosted Supabase staging binding required');
 const key = env.SUPABASE_SERVICE_ROLE_KEY;
 if (!key) throw Error('Server-only staging key required');
 if (!key.startsWith('sb_secret_')) {
  try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'service_role') throw Error(); }
  catch { throw Error('Server-only staging key required'); }
 }
 const flag = name => { const value=env[name]??'false';if(!['true','false'].includes(value))throw Error('Invalid explicit transport flag');return value==='true'; };
 const push=flag('S11_PUSH_ENABLED'),billing=flag('S11_BILLING_ENABLED'),webhook=flag('S11_WEBHOOK_ENABLED');
 if(push&&!env.EXPO_ACCESS_TOKEN)throw Error('Explicit own Expo server access token required for staging push');
 if(billing&&!env.REVENUECAT_SECRET_KEY)throw Error('RevenueCat server key required for staging reconciliation');
 if(webhook&&!env.REVENUECAT_WEBHOOK_AUTH)throw Error('Webhook authentication required');
 return {url:endpoint.origin,host:endpoint.hostname,key,push,billing,webhook};
}
export async function verifyStaging(admin, config) {
 await rpc(admin,'verify_s11_staging',{expected_host:config.host});
 const response=await admin.from('s9_config').select('environment,enabled').single().abortSignal(AbortSignal.timeout(10000));
 if(response.error||response.data.environment!=='SANDBOX')throw Error('Staging requires SANDBOX billing configuration');
 if((config.billing||config.webhook)&&!response.data.enabled)throw Error('Staging billing is disabled in the database');
}
// Injectable existing operations allow fail-closed tests without contacting any provider.
export async function stagingTick(admin, config, { signal, report=()=>{}, operations={} }={}) {
 const op={verify:verifyStaging,poll:pollS6Sources,rpc,dispatch:processS7Job,receipts:checkS7Receipts,reconcile:reconcileOne,...operations};
 signal?.throwIfAborted();await op.verify(admin,config);signal?.throwIfAborted(); // Before pruning, scheduling, HTTP or subprocesses. Repeated every tick.
 let failures=0;
 async function task(stage, action){try{await action();}catch{failures++;report({stage,status:'operation_failed_leases_retained'});}}
 await task('retention',async()=>{await op.rpc(admin,'prune_s11_metrics');});
 await task('ingestion',async()=>{
  const result=await op.poll({admin,sources:['madrid','toronto','helsinki'],force:false,signal,report});
  if(result.failures)failures++;
 });
 for(const name of ['run_s7_scheduler','run_s8_scheduler']) await task(name,async()=>{
  for(let n=0;n<20&&!signal?.aborted;n++){const result=await op.rpc(admin,name);report({stage:name,status:result.status,items:result.items??0});if(result.status==='idle')break;}
 });
 if(config.billing&&!signal?.aborted) await task('billing',async()=>{
  // Existing reconciler checks server config/claim generation and bounds the provider request.
  await op.reconcile(admin,process.env.REVENUECAT_SECRET_KEY);
 });
 if(config.push&&!signal?.aborted) await task('push',async()=>{
  for(let n=0;n<20&&!signal?.aborted;n++){const status=await op.dispatch(admin,'expo');report({stage:'push',status,device_delivery_verified:false});if(status==='idle')break;}
  await op.receipts(admin);
 });
 return {failures};
}
