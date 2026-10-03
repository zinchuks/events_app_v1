import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stagingConfig, stagingTick, verifyStaging } from './lib/s11-staging.mjs';
const env={APP_ENV:'staging',SUPABASE_URL:'https://synthetic-stage.supabase.co',STAGING_SUPABASE_HOST:'synthetic-stage.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic'};
test('staging rejects loopback, mismatched host, public key and accidental environment',()=>{
 for(const patch of [{APP_ENV:'development'},{SUPABASE_URL:'http://127.0.0.1:54321'},{STAGING_SUPABASE_HOST:'different.supabase.co'},{SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_synthetic'},{SUPABASE_URL:'https://u:p@synthetic-stage.supabase.co'}]) assert.throws(()=>stagingConfig({...env,...patch}));
 assert.equal(stagingConfig(env).push,false);assert.equal(stagingConfig(env).billing,false);assert.equal(stagingConfig(env).webhook,false);
});
test('external transport flags must be explicit and credentialed',()=>{
 for(const patch of [{S11_PUSH_ENABLED:'tru'},{S11_PUSH_ENABLED:'true'},{S11_BILLING_ENABLED:'true'},{S11_WEBHOOK_ENABLED:'true'}])assert.throws(()=>stagingConfig({...env,...patch}));
});
test('database binding failure starts no maintenance, schedule, subprocess or provider operation',async()=>{
 const calls=[];const fail=()=>{calls.push('unexpected');};
 await assert.rejects(stagingTick({},stagingConfig(env),{operations:{verify:async()=>{throw Error('not staging');},poll:fail,rpc:fail,dispatch:fail,receipts:fail,reconcile:fail}}));
 assert.deepEqual(calls,[]);
});
test('an ingestion failure does not skip inbox schedules and disabled transports send zero requests',async()=>{
 const calls=[];const events=[];
 const operations={verify:async()=>{},poll:async options=>{assert.equal(options.force,false);throw Error('synthetic outage');},rpc:async(_admin,name)=>{calls.push(name);return{status:'idle'};},dispatch:async()=>{throw Error('unexpected provider call');},reconcile:async()=>{throw Error('unexpected provider call');}};
 const result=await stagingTick({},stagingConfig(env),{operations,report:value=>events.push(value)});
 assert.equal(result.failures,1);assert.deepEqual(calls,['prune_s11_metrics','run_s7_scheduler','run_s8_scheduler']);
 assert.equal(events[0].status,'operation_failed_leases_retained');
});
test('a revoked database binding is rechecked on the next cycle',async()=>{
 let valid=true;let mutations=0;
 const operations={verify:async()=>{if(!valid)throw Error('revoked');},poll:async()=>({failures:0}),rpc:async()=>{mutations++;return{status:'idle'};}};
 await stagingTick({},stagingConfig(env),{operations});const before=mutations;valid=false;
 await assert.rejects(stagingTick({},stagingConfig(env),{operations}));assert.equal(mutations,before);
});
test('a staging database must have SANDBOX billing and cannot enable a disabled provider',async()=>{
 const admin={rpc:()=>({abortSignal:async()=>({data:null,error:null})}),from:()=>({select:()=>({single:()=>({abortSignal:async()=>({data:{environment:'PRODUCTION',enabled:true},error:null})})})})};
 await assert.rejects(verifyStaging(admin,stagingConfig(env)),/SANDBOX/);
 admin.from=()=>({select:()=>({single:()=>({abortSignal:async()=>({data:{environment:'SANDBOX',enabled:false},error:null})})})});
 await assert.rejects(verifyStaging(admin,{...stagingConfig(env),billing:true}),/disabled/);
});
