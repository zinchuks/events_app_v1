// Real local API/RLS and live Madrid catalog. Disposable users only; never reset.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localClients} from './lib/local-clients.mjs';
const{admin,client}=localClients();const a=client(),b=client(),anon=client();const users=[];const password=randomUUID()+'!Aa1';let checks=0;
function ok(r){assert.equal(r.error,null,r.error?.message);checks++;return r.data;}
function denied(r){assert.ok(r.error);checks++;}
function check(v,message){assert.ok(v,message);checks++;}
try{
 for(const c of [a,b]){const email='s5-'+randomUUID()+'@example.test';const d=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(d.user.id);ok(await c.auth.signInWithPassword({email,password}));}
 const catalog=ok(await anon.rpc('list_s5_events'));check(catalog.total>30,'Requires live Madrid import');check(catalog.items.length===30);check(catalog.mapped>=0&&catalog.mapped<=catalog.total,'Mapped count must be a subset of the catalog');
 const repeated=ok(await anon.rpc('list_s5_events'));assert.deepEqual(catalog,repeated);checks++;
 const second=ok(await anon.rpc('list_s5_events',{page_offset:30}));check(second.total===catalog.total);check(!second.items.some(i=>catalog.items.some(j=>i.id===j.id)));
 const query=catalog.items[0].title;const search=ok(await anon.rpc('list_s5_events',{search_text:query}));check(search.items.some(i=>i.title===query));check(search.total<=catalog.total);
 const missing=ok(await anon.rpc('list_s5_events',{search_text:randomUUID()}));check(missing.total===0&&missing.items.length===0);
 const literal=ok(await anon.rpc('list_s5_events',{search_text:'%_'}));check(literal.total===0,'Search is literal, not SQL wildcard');
 for(const args of [{view_mode:'private'},{search_text:'x'.repeat(121)},{page_size:1001},{page_offset:-1},{view_mode:null},{page_size:null}])denied(await anon.rpc('list_s5_events',args));
 denied(await anon.rpc('list_s5_events',{view_mode:'matches'}));check(ok(await a.rpc('list_s5_events',{view_mode:'matches'})).total===0);
 const city=ok(await anon.from('territories').select('id').eq('external_id','madrid:municipio:Madrid').single());
 const doc={name:'Disposable S5 rule',enabled:true,timezone:'Europe/Madrid',filters:{scope:'s4',categories:['music'],languages:[],include_unknown_language:true,include_unknown_price:true,include_unknown_age:true},event_horizon:{kind:'days',days:30},areas:[{kind:'city',territory_id:city.id,parameters:{}}]};
 denied(await anon.rpc('save_s5_rule',{rule_document:doc,delivery_preferences:{mode:'daily',time:'18:00'}}));
 const id=ok(await a.rpc('save_s5_rule',{rule_document:doc,delivery_preferences:{mode:'daily',time:'18:00'}}));const row=ok(await a.from('rules').select('delivery_schedule,event_horizon,next_run_at').eq('id',id).single());check(row.delivery_schedule.mode==='daily'&&row.delivery_schedule.active===false);check(row.event_horizon.days===30&&row.next_run_at===null);
 check(ok(await a.from('notification_jobs').select('id').eq('user_id',users[0])).length===0);
 const union=ok(await a.rpc('list_s5_events',{view_mode:'matches',page_size:1000}));check(union.total>0&&union.items.every(i=>i.category_code==='music'&&i.matched_rules.length===1));check(new Set(union.items.map(i=>i.id)).size===union.items.length);check(ok(await a.rpc('list_s5_events')).items.every(i=>i.matched_rules.length===0),'Public catalog exposes no private match IDs');check(union.mapped===union.items.filter(i=>i.longitude!==null&&i.latitude!==null).length);
 check(ok(await b.rpc('list_s5_events',{view_mode:'matches'})).total===0);denied(await b.rpc('set_s5_delivery_preferences',{selected_rule:id,delivery_preferences:{mode:'manual'},rule_timezone:'Europe/Madrid'}));
 for(const prefs of [{mode:null},{},{mode:'daily',time:'24:00'},{mode:'weekdays',time:'18:00',weekdays:[]},{mode:'weekdays',time:'18:00',weekdays:[1,1]},{mode:'interval',time:'18:00',days:0,anchor:'2026-10-02'},{mode:'interval',time:'18:00',days:7,anchor:'2026-02-30'},{mode:'manual',unexpected:true}]){
  denied(await a.rpc('save_s5_rule',{rule_document:{...doc,name:'Should roll back'},delivery_preferences:prefs}));
 }
 check(ok(await a.from('rules').select('id').eq('user_id',users[0])).length===1,'Invalid preference must roll back rule and areas');
 ok(await a.rpc('set_s5_delivery_preferences',{selected_rule:id,delivery_preferences:{mode:'weekdays',time:'19:30',weekdays:[1,7]},rule_timezone:'America/Toronto'}));const saved=ok(await a.from('rules').select('timezone,delivery_schedule,event_horizon,next_run_at').eq('id',id).single());check(saved.timezone==='America/Toronto'&&saved.delivery_schedule.weekdays.length===2&&saved.next_run_at===null&&saved.event_horizon.days===30);
 denied(await a.rpc('set_s5_delivery_preferences',{selected_rule:id,delivery_preferences:{mode:'manual'},rule_timezone:'fake/timezone'}));
 assert.deepEqual(ok(await anon.rpc('s5_event_coordinates',{occurrence:catalog.items[0].id})),catalog.items[0].longitude===null?null:{longitude:catalog.items[0].longitude,latitude:catalog.items[0].latitude});checks++;check(ok(await anon.rpc('s5_event_coordinates',{occurrence:randomUUID()}))===null);
 // Saved/inbox owner pages remain restricted through direct PostgREST, used by S5 UI.
 ok(await a.from('saved_events').insert({user_id:users[0],occurrence_id:catalog.items[0].id}));check(ok(await b.from('saved_events').select('occurrence_id').eq('user_id',users[0]).range(0,19)).length===0);
 check(ok(await a.from('saved_events').select('occurrence_id').eq('user_id',users[0]).range(0,19)).length===1);
 console.log(JSON.stringify({checks,integration:'actual local Auth/PostgREST/RLS/live Madrid',catalog_total:catalog.total,music_total:union.total,push_sends:0,native:'unverified'}));
}finally{for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error){console.error('Own S5 fixture cleanup failed');process.exitCode=1;}}}
