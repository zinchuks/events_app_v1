// Original adapter; provider data is fetched server-side, never accepted from mobile.
import { timingSafeEqual } from 'node:crypto';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function authorizedWebhook(actual, expected) {
 if (!expected || !actual) return false;
 const a=Buffer.from(actual);const b=Buffer.from(expected);
 return a.length===b.length && timingSafeEqual(a,b);
}
export function webhookOwners(body,config) {
 const e=body?.event;
 if (!e || typeof e.id!=='string' || e.id.length<1 || e.id.length>200 || typeof e.type!=='string') throw Error('invalid_webhook');
 if (e.type==='TEST') return {eventKey:e.id,owners:[]};
 // TRANSFER can omit environment; the fetched subscription still enforces the configured environment.
 if (!config.app_ids.includes(e.app_id) || (e.environment!==config.environment && !(e.type==='TRANSFER'&&e.environment==null))) throw Error('wrong_environment_or_app');
 if(e.type==='TRANSFER'&&(!Array.isArray(e.transferred_from)||!Array.isArray(e.transferred_to)))throw Error('invalid_identity');
 const identities=e.type==='TRANSFER' ? [...e.transferred_from,...e.transferred_to] : [e.app_user_id];
 if (!Array.isArray(identities) || identities.length>100) throw Error('invalid_identity');
 return {eventKey:e.id,owners:[...new Set(identities.filter(value=>typeof value==='string'&&uuid.test(value)))]};
}
function date(value) {
 if(value===null)return null;
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('invalid_provider_date');
 return new Date(value).toISOString();
}
export function subscriberSnapshot(body,config,now=Date.now()) {
 if(!body?.subscriber || typeof body.subscriber.entitlements!=='object' || body.subscriber.entitlements===null
  || !Number.isSafeInteger(body.request_date_ms) || body.request_date_ms>now+60000 || body.request_date_ms<now-600000)throw Error('invalid_provider_response');
 const result={tier:'free',expires_at:null,grace_until:null,observed_at:new Date(body.request_date_ms).toISOString(),environment:config.environment};
 const e=body.subscriber.entitlements[config.entitlement_id];
 if(!e)return result;
 if(!config.product_ids.includes(e.product_identifier))return result;
 const s=body.subscriber.subscriptions?.[e.product_identifier];
 if(!s || !['app_store','play_store'].includes(s.store) || typeof s.is_sandbox!=='boolean'
  || (s.is_sandbox?'SANDBOX':'PRODUCTION')!==config.environment || s.refunded_at)return result;
 // This app offers subscriptions only: NULL expiration/lifetime grants fail closed.
 const expiry=date(e.expires_date);const grace=date(e.grace_period_expires_date??null);
 if(!expiry)return result;
 result.expires_at=expiry;result.grace_until=grace;
 if(Math.max(Date.parse(expiry),grace?Date.parse(grace):0)>now)result.tier='plus';
 return result;
}
export async function reconcileOne(admin,key,fetcher=fetch) {
 const config=await admin.from('s9_config').select('*').single();if(config.error)throw Error('billing_config_unavailable');
 if(!config.data.enabled)return {status:'disabled',provider_requests:0};
 if(!key)return {status:'missing_server_key',provider_requests:0};
 const claim=await admin.rpc('claim_s9_reconcile');if(claim.error)throw Error('claim_failed');
 const q=claim.data;if(q.status!=='claimed')return q;
 try {
  const response=await fetcher('https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(q.owner_id),{
   headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('provider_unavailable');
  const reader=response.body.getReader();let text='';let bytes=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024){await reader.cancel();throw Error('provider_response_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  const snapshot=subscriberSnapshot(JSON.parse(text),config.data);
  const done=await admin.rpc('finish_s9_reconcile',{owner_id:q.owner_id,nonce:q.claim,snapshot});
  if(done.error)throw Error('snapshot_failed');
  return {status:done.data?'reconciled':'lost_lease',provider_requests:1};
 } catch {
  await admin.rpc('fail_s9_reconcile',{owner_id:q.owner_id,nonce:q.claim});
  return {status:'retry_later',provider_requests:1}; // no raw provider errors/identities/secrets in logs
 }
}
