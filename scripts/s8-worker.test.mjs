import test from 'node:test';
import assert from 'node:assert/strict';
import { processS7Job } from './lib/s7-worker.mjs';
function admin(kind,beginStatus='dispatch'){
 const calls=[];return {calls,rpc(name,params){calls.push({name,params});return {abortSignal:async()=>({error:null,data:name==='claim_s7_notification'?{status:'claimed',id:'job',token:'fence'}:name==='begin_s7_delivery'?{status:beginStatus,delivery_id:'delivery',device_token:'fixture-token',locale:'uk',digest_id:'owner-digest',ttl_seconds:59}:true})};},from(name){const b={select:()=>b,eq:()=>b,single:()=>b,order:()=>b,range:()=>b,abortSignal:async()=>({error:null,data:name==='notification_jobs'?{user_id:'owner',s8_alert_id:'alert'}:name==='s8_alerts'?{kind}:[{id:'device'}]})};return b;}};
}
test('S8 reuses fenced transport with localized short update/reminder titles and private digest link',async()=>{
 for(const [kind,title] of [['changed','Збережена подія змінилася'],['cancelled','Збережену подію скасовано'],['reminder','Нагадування про подію']]){
  const a=admin(kind);let sends=0;
  await processS7Job(a,'expo',async(_url,options)=>{sends++;const [p]=JSON.parse(options.body);assert.equal(p.title,title);assert.deepEqual(p.data,{digest_id:'owner-digest'});assert.equal(p.body,'Event Radar');assert.equal(p.ttl,59);return {status:200,ok:true,json:async()=>({data:[{status:'ok',id:'synthetic-ticket'}]})};});
  assert.equal(sends,1);assert.equal(a.calls.find(c=>c.name==='finish_s7_delivery').params.ticket,'synthetic-ticket');
 }
});
test('S8 changed start, expiry, unsave, quiet and stale veto after claim never call provider',async()=>{
 for(const status of ['event_changed','expired','unsaved_or_paused','quiet','selection_unavailable']){const a=admin('reminder',status);let sends=0;await processS7Job(a,'expo',async()=>{sends++;throw Error('Forbidden');});assert.equal(sends,0);assert.ok(!a.calls.some(c=>c.name==='finish_s7_delivery'));}
});
