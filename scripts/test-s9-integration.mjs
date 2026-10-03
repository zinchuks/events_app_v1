// Actual Auth/PostgREST checks, only own disposable users, no catalog/config changes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { localClients } from './lib/local-clients.mjs';
const {admin,client}=localClients();const a=client(),b=client(),anon=client();const users=[];let checks=0;
let webhook;
function ok(r){assert.equal(r.error,null,r.error?.message);checks++;return r.data;}
function denied(r){assert.ok(r.error);checks++;}
function check(v){assert.ok(v);checks++;}
try{
 for(const c of [a,b]){const email='s9-'+randomUUID()+'@example.test';const password=randomUUID()+'Aa1!';const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(u.user.id);ok(await c.auth.signInWithPassword({email,password}));}
 const city=ok(await anon.from('territories').select('id').eq('kind','city').eq('is_demo',false).limit(1).single());
 const doc={name:'Disposable S9',enabled:true,timezone:'UTC',filters:{scope:'s4',categories:[],languages:[],include_unknown_language:true,include_unknown_price:true,include_unknown_age:true},event_horizon:{kind:'days',days:30},areas:[{kind:'city',territory_id:city.id,parameters:{}}]};
 const id=ok(await a.rpc('save_s4_rule',{rule_document:doc}));const second=ok(await a.rpc('save_s4_rule',{rule_document:doc}));
 let state=ok(await a.rpc('s9_state'));check(state.tier==='free'&&state.active_rules.length===1);
 ok(await a.rpc('choose_s9_free_rule',{selected_rule:second}));state=ok(await a.rpc('s9_state'));check(state.active_rules[0]===second);
 check(ok(await a.from('rules').select('*')).length===2);
 denied(await b.rpc('choose_s9_free_rule',{selected_rule:id}));denied(await anon.rpc('s9_state'));
 denied(await a.from('entitlements').upsert({user_id:users[0],tier:'plus',expires_at:new Date(Date.now()+86400000).toISOString()}));
 denied(await a.from('rules').update({billing_paused:false}).eq('id',id));
 for(const table of ['s9_config','s9_preferences','s9_webhook_events','s9_reconcile_queue'])denied(await a.from(table).select('*'));
 for(const name of ['claim_s9_reconcile','finish_s9_reconcile','enqueue_s9_reconcile','s9_tier','s9_refresh_rules']){
  const args=name==='finish_s9_reconcile'?{owner_id:users[0],nonce:randomUUID(),snapshot:{tier:'plus'}}:name==='enqueue_s9_reconcile'||name==='s9_tier'||name==='s9_refresh_rules'?{owner_id:users[0]}:{};
  denied(await a.rpc(name,args));
 }
 denied(await a.rpc('build_s3_digest',{selected_rule:id}));
 ok(await a.rpc('set_s7_delivery_preferences',{selected_rule:second,delivery_preferences:{mode:'daily',active:true,time:'18:00'},rule_timezone:'UTC'}));
 state=ok(await a.rpc('s9_state'));check(!state.active_rules.includes(second));
 check(ok(await a.from('rules').select('billing_paused,next_run_at').eq('id',second).single()).next_run_at===null);
 check(ok(await a.rpc('s4_matches')).every(m=>m.rule_id!==second));
 ok(await a.rpc('set_s7_delivery_preferences',{selected_rule:second,delivery_preferences:{mode:'weekdays',active:true,time:'18:00',weekdays:[1]},rule_timezone:'UTC'}));
 state=ok(await a.rpc('s9_state'));check(state.active_rules[0]===second);
 check(ok(await b.from('rules').select('*')).length===0);check(ok(await b.from('entitlements').select('*')).length===0);
 const reconcile=ok(await a.rpc('request_s9_reconcile'));check(reconcile===false);
 const auth='fixture-'+randomUUID();
 webhook=spawn(process.execPath,['scripts/billing-s9-local.mjs','webhook'],{env:{...process.env,REVENUECAT_WEBHOOK_AUTH:auth},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Local webhook startup timed out')),10000);webhook.once('error',()=>{clearTimeout(timer);reject(Error('Local webhook unavailable'));});webhook.once('exit',()=>{clearTimeout(timer);reject(Error('Local webhook exited'));});webhook.stdout.on('data',value=>{if(value.toString().includes('Local authenticated webhook:')){clearTimeout(timer);resolve();}});});
 const url='http://127.0.0.1:8099/revenuecat';
 check((await fetch(url,{method:'POST',body:'{}'})).status===401);
 check((await fetch(url,{method:'POST',headers:{Authorization:'wrong'},body:'{}'})).status===401);
 check((await fetch(url,{method:'POST',headers:{Authorization:auth},body:'я'.repeat(40000)})).status===413);
 check((await fetch(url,{method:'POST',headers:{Authorization:auth},body:JSON.stringify({event:{id:'fixture',type:'TEST'}})})).status===503);
 check(ok(await admin.from('s9_webhook_events').select('event_id').eq('event_id','fixture')).length===0);
 console.log(JSON.stringify({checks,actual_auth_postgrest:true,config_mutated:false,store_purchases_verified:false,provider_requests:0}));
}finally{if(webhook&&webhook.exitCode===null){webhook.kill('SIGTERM');await new Promise(resolve=>webhook.once('exit',resolve));}for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error){console.error('Own S9 fixture cleanup failed');process.exitCode=1;}}}
