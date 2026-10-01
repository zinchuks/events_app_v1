// Actual local Auth/PostgREST/RLS + imported live Madrid catalog. No network push.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const { admin, client } = localClients(); const a=client(), b=client(), anon=client();
const users=[]; const password=randomUUID()+'!aA1'; let checks=0;
function ok(r){assert.equal(r.error,null,r.error?.message);checks++;return r.data;}
function denied(r){assert.ok(r.error);checks++;}
async function user(c){const email='s4-'+randomUUID()+'@example.test';const data=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(data.user.id);ok(await c.auth.signInWithPassword({email,password}));return data.user.id;}
try{
 await user(a);await user(b);
 const territories=ok(await anon.from('territories').select('id,kind,external_id').eq('is_demo',false));
 const madrid=territories.find(t=>t.external_id==='madrid:municipio:Madrid');const es=territories.find(t=>t.external_id==='iso3166:ES');const ua=territories.find(t=>t.external_id==='iso3166:UA');assert.ok(madrid&&es&&ua);checks++;
 const base={name:'Disposable S4 API rule',enabled:true,timezone:'Europe/Madrid',event_horizon:{kind:'days',days:30},filters:{scope:'s4',categories:['music'],languages:[],include_unknown_language:true,include_unknown_price:true,include_unknown_age:true,price_min:null,price_max:null,currency:null,age_min:null,age_max:null},areas:[{kind:'city',territory_id:madrid.id,parameters:{}}]};
 denied(await anon.rpc('save_s4_rule',{rule_document:base}));denied(await anon.rpc('list_rule_events'));denied(await anon.rpc('build_rule_digest'));
 const id=ok(await a.rpc('save_s4_rule',{rule_document:base}));assert.ok(id);checks++;
 denied(await a.from('rules').insert({user_id:users[0],name:'Direct write bypass',filters:base.filters,event_horizon:base.event_horizon}));
 denied(await a.from('rule_areas').insert({user_id:users[0],rule_id:id,kind:'city',territory_id:madrid.id}));
 const first=ok(await a.rpc('list_rule_events',{selected_rule:id}));assert.ok(first.length>0,'Live Madrid import required');assert.ok(first.every(v=>v.category_code==='music'&&v.matched_rules.length===1));checks+=2;
 assert.equal(ok(await b.from('rules').select('id').eq('id',id)).length,0);assert.equal(ok(await b.from('rule_areas').select('id').eq('rule_id',id)).length,0);checks+=2;
 denied(await b.rpc('save_s4_rule',{rule_document:base,selected_rule:id}));denied(await b.rpc('set_s4_rule_enabled',{selected_rule:id,rule_enabled:false}));assert.equal(ok(await b.rpc('list_rule_events',{selected_rule:id})).length,0);checks++;
 ok(await b.from('rules').update({name:'forged'}).eq('id',id));assert.equal(ok(await a.from('rules').select('name').eq('id',id).single()).name,base.name);checks++;
 denied(await b.from('rule_areas').insert({user_id:users[1],rule_id:id,kind:'city',territory_id:madrid.id}));
 const id2=ok(await a.rpc('save_s4_rule',{rule_document:{...base,name:'Second independent rule',areas:[{kind:'country',territory_id:es.id},{kind:'country',territory_id:ua.id}]}}));
 const union=ok(await a.rpc('list_rule_events'));assert.ok(union.length);assert.equal(new Set(union.map(i=>i.id)).size,union.length);assert.ok(union.every(i=>i.matched_rules.length===2));checks+=3;
 const [x,y]=await Promise.all([a.rpc('build_rule_digest'),a.rpc('build_rule_digest')]);const digest=ok(x);assert.ok(digest);assert.equal(digest,ok(y));checks+=2;
 const rows=ok(await a.from('digest_items').select('occurrence_id').eq('digest_id',digest));assert.equal(new Set(rows.map(r=>r.occurrence_id)).size,rows.length);assert.ok(rows.length>=union.length);checks+=2;
 assert.equal(ok(await a.from('notification_jobs').select('id').eq('digest_id',digest)).length,0);assert.equal(ok(await b.from('digest_items').select('occurrence_id').eq('digest_id',digest)).length,0);checks+=2;
 ok(await a.rpc('set_s4_rule_enabled',{selected_rule:id2,rule_enabled:false}));assert.ok(ok(await a.rpc('list_rule_events')).every(r=>r.matched_rules.length===1));checks++;
 ok(await a.rpc('save_s4_rule',{rule_document:{...base,name:'Edited title'},selected_rule:id}));assert.equal(ok(await a.from('rules').select('name').eq('id',id).single()).name,'Edited title');checks++;
 const unknownPrice={...base,filters:{...base.filters,price_max:25,currency:'EUR',include_unknown_price:false}};ok(await a.rpc('save_s4_rule',{rule_document:unknownPrice,selected_rule:id}));assert.equal(ok(await a.rpc('list_rule_events')).length,0);checks++;
 ok(await a.rpc('save_s4_rule',{rule_document:{...unknownPrice,filters:{...unknownPrice.filters,include_unknown_price:true}},selected_rule:id}));assert.ok(ok(await a.rpc('list_rule_events')).length);checks++;
 ok(await a.rpc('save_s4_rule',{rule_document:{...base,filters:{...base.filters,languages:['es'],include_unknown_language:false}},selected_rule:id}));assert.equal(ok(await a.rpc('list_rule_events')).length,0);checks++;
 ok(await a.rpc('save_s4_rule',{rule_document:{...base,areas:[{kind:'radius',parameters:{longitude:-3.7,latitude:40.42,meters:10000}}]},selected_rule:id}));assert.equal(ok(await a.rpc('list_rule_events')).length,0,'Unknown coordinates cannot match radius');checks++;
 denied(await a.rpc('save_s4_rule',{rule_document:{...base,areas:[{kind:'polygon',parameters:{points:[[0,0],[1,1],[0,1],[1,0]]}}]},selected_rule:id}));
 assert.equal(ok(await a.from('rule_areas').select('kind').eq('rule_id',id).single()).kind,'radius','Failed update rolled back previous area');checks++;
 denied(await a.from('rules').update({filters:{...base.filters,price_min:-1}}).eq('id',id).select().single());
 denied(await a.from('rule_areas').update({parameters:{longitude:0,latitude:0,meters:0}}).eq('rule_id',id).select().single());
 denied(await a.rpc('save_s4_rule',{rule_document:{...base,user_id:users[1]}}));
 ok(await a.from('rules').delete().eq('id',id));assert.equal(ok(await a.from('rule_areas').select('id').eq('rule_id',id)).length,0);assert.equal(ok(await a.from('digests').select('id').eq('id',digest)).length,1);checks+=2;
 console.log(JSON.stringify({checks,actual_integration:'local Auth/PostgREST/RLS',real_catalog:'imported Ayuntamiento de Madrid',push_sends:0,native:'unverified'}));
}finally{for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error){console.error('Own S4 fixture cleanup failed');process.exitCode=1;}}}
