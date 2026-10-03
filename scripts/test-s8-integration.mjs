// Actual local Auth/PostgREST/RLS. Disposable users only; real catalog facts unchanged.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const { admin, client }=localClients();const a=client();const b=client();const anon=client();
const users=[];const password=randomUUID()+'!Aa1';let checks=0;
function ok(r){assert.equal(r.error,null,r.error?.message);checks++;return r.data;}
function denied(r){assert.ok(r.error);checks++;}
function check(v){assert.ok(v);checks++;}
try {
 for(const c of [a,b]){const email='s8-'+randomUUID()+'@example.test';const d=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(d.user.id);ok(await c.auth.signInWithPassword({email,password}));}
 const o=ok(await anon.from('occurrences').select('id').eq('status','scheduled').eq('time_kind','known').gt('start_at',new Date(Date.now()+3*86400000).toISOString()).order('start_at').limit(1).single());
 ok(await a.from('saved_events').upsert({user_id:users[0],occurrence_id:o.id}));
 ok(await a.from('saved_events').upsert({user_id:users[0],occurrence_id:o.id})); // existing contract
 check(ok(await a.from('s8_alerts').select('id')).length===0);
 const prefs={selected_occurrence:o.id,leads:[120,1440],updates:true,zone:'Europe/Madrid',quiet:null};
 denied(await anon.rpc('set_s8_saved_preferences',prefs));denied(await b.rpc('set_s8_saved_preferences',prefs));
 ok(await a.rpc('set_s8_saved_preferences',prefs));
 const row=ok(await a.from('saved_events').select('*').eq('occurrence_id',o.id).single());check(row.reminder_minutes.join(',')==='120,1440');check(row.reminder_revision===1);
 const alerts=ok(await a.from('s8_alerts').select('*'));check(alerts.length===2&&alerts.every(x=>x.kind==='reminder'&&x.status==='pending'));
 check(ok(await b.from('s8_alerts').select('*')).length===0);
 denied(await anon.from('s8_alerts').select('*'));
 ok(await a.rpc('set_s8_saved_preferences',{...prefs,leads:[1440,120]}));
 check(ok(await a.from('saved_events').select('reminder_revision').eq('occurrence_id',o.id).single()).reminder_revision===1);
 check(ok(await a.from('s8_alerts').select('id')).length===2);
 for(const leads of [[120,120],[0],[10081],[5,10,15,20]])denied(await a.rpc('set_s8_saved_preferences',{...prefs,leads}));
 for(const quiet of [{start:'22:00',end:'22:00'},{start:'22:00',end:'24:00'},{start:'22:00',end:'08:00',extra:true}])denied(await a.rpc('set_s8_saved_preferences',{...prefs,quiet}));
 denied(await a.rpc('set_s8_saved_preferences',{...prefs,zone:'invented/zone'}));
 denied(await a.from('saved_events').update({reminder_revision:0,reminder_minutes:[5]}).eq('occurrence_id',o.id));
 denied(await a.from('s8_alerts').update({status:'published'}).eq('id',alerts[0].id));
 for(const c of [a,anon]){
  denied(await c.rpc('run_s8_scheduler'));
  denied(await c.rpc('correct_s8_occurrence',{selected_occurrence:o.id,patch:{status:'cancelled'},reason:'Unauthorized fixture'}));
  denied(await c.from('s8_state').select('*'));denied(await c.from('s8_corrections').select('*'));denied(await c.from('s8_correction_log').select('*'));
 }
 check(['scheduled','outdated'].includes(ok(await anon.rpc('s8_availability',{selected_occurrence:o.id}))));
 ok(await a.rpc('set_s8_saved_preferences',{...prefs,leads:[],updates:false,quiet:{start:'22:00',end:'08:00'}}));
 check(ok(await a.from('s8_alerts').select('id').eq('status','pending')).length===0);
 ok(await a.from('saved_events').delete().eq('occurrence_id',o.id));
 check(ok(await a.from('saved_events').select('occurrence_id')).length===0);
 ok(await a.from('saved_events').insert({user_id:users[0],occurrence_id:o.id}));
 ok(await a.rpc('set_s8_saved_preferences',prefs));
 check(ok(await a.from('s8_alerts').select('id').eq('status','pending')).length===2);
 denied(await a.from('saved_events').update({reminder_epoch:randomUUID()}).eq('occurrence_id',o.id));
 console.log(JSON.stringify({checks,integration:'actual local Auth/PostgREST/RLS and real catalog reminder preferences',catalog_mutated:false,expo_requests:0,device_delivery_verified:false}));
}finally{for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error){console.error('Own S8 fixture cleanup failed');process.exitCode=1;}}}
