// Explicit temporary synthetic browser fixture, local only. Never changes original events.
import { readFile,writeFile,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
import { rpc } from './lib/s7-worker.mjs';
const stateFile='/private/tmp/event-radar-s8-preview.json';const [operation,email,...extra]=process.argv.slice(2);
if(extra.length||!['create','cleanup'].includes(operation))throw Error('Usage: preview-s8-local.mjs create OWNER_EMAIL | cleanup');
const {admin}=localClients();
function ok(r){if(r.error)throw Error('Synthetic preview operation failed');return r.data;}
if(operation==='create'){
 try{await readFile(stateFile);throw Error('Clean previous preview first');}catch(e){if(e.code!=='ENOENT')throw e;}
 const users=ok(await admin.auth.admin.listUsers({perPage:1000}));const owner=users.users.find(u=>u.email===email)?.id;
 if(!owner)throw Error('Existing local owner required');
 const source=randomUUID();const event=randomUUID();const occurrence=randomUUID();
 await writeFile(stateFile,JSON.stringify({owner,source,event,occurrence}),{flag:'wx',mode:0o600});
 ok(await admin.from('sources').insert({id:source,name:'Synthetic S8 browser QA',url:'https://fixture.invalid/s8-browser-qa',acquisition:'fixture',terms_status:'allowed',allow_cache:true,last_success_at:new Date().toISOString()}));
 ok(await admin.from('events').insert({id:event,primary_source_id:source,canonical_url:'https://fixture.invalid/s8-browser-qa/event',checked_at:new Date().toISOString(),title:'ТЕСТ S8 — тимчасова подія',venue:'Тестовий майданчик',description:'Synthetic browser QA fixture. Not a real event.'}));
 ok(await admin.from('occurrences').insert({id:occurrence,event_id:event,external_id:'s8-browser-qa',time_kind:'known',start_at:new Date(Date.now()+5*86400000).toISOString(),timezone:'Europe/Madrid'}));
 ok(await admin.from('saved_events').insert({user_id:owner,occurrence_id:occurrence}));
 await rpc(admin,'correct_s8_occurrence',{selected_occurrence:occurrence,patch:{start_at:new Date(Date.now()+6*86400000).toISOString(),venue:'Інший тестовий майданчик'},reason:'Synthetic browser change QA fixture'});
 await rpc(admin,'run_s8_scheduler');
 await rpc(admin,'correct_s8_occurrence',{selected_occurrence:occurrence,patch:{status:'cancelled'},reason:'Synthetic browser cancellation QA fixture'});
 await rpc(admin,'run_s8_scheduler');
 const alerts=ok(await admin.from('s8_alerts').select('kind,digest_id').eq('occurrence_id',occurrence).eq('user_id',owner));
 console.log(JSON.stringify({synthetic:true,occurrence,alerts,expo_requests:0}));
}else{
 const s=JSON.parse(await readFile(stateFile,'utf8'));
 for(const id of [s.owner,s.source,s.event,s.occurrence])if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid own fixture identifier');
 const source=ok(await admin.from('sources').select('name,url').eq('id',s.source).maybeSingle());
 if(source&&(source.name!=='Synthetic S8 browser QA'||source.url!=='https://fixture.invalid/s8-browser-qa'))throw Error('Not our synthetic fixture');
 ok(await admin.from('saved_events').delete().eq('user_id',s.owner).eq('occurrence_id',s.occurrence));
 const alerts=ok(await admin.from('s8_alerts').select('digest_id').eq('user_id',s.owner).eq('occurrence_id',s.occurrence));
 for(const a of alerts)if(a.digest_id)ok(await admin.from('digests').delete().eq('user_id',s.owner).eq('id',a.digest_id));
 ok(await admin.from('s8_correction_log').delete().eq('occurrence_id',s.occurrence));
 ok(await admin.from('events').delete().eq('id',s.event).eq('primary_source_id',s.source));
 ok(await admin.from('sources').delete().eq('id',s.source).eq('name','Synthetic S8 browser QA'));
 await unlink(stateFile);console.log(JSON.stringify({own_synthetic_preview_removed:true}));
}
