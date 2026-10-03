// Explicit synthetic admin browser QA; no saved entries, real events or owner preferences changed.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {localClients} from './lib/local-clients.mjs';
const stateFile='/private/tmp/event-radar-s10-preview.json';const [operation]=process.argv.slice(2);
if(!['create','cleanup'].includes(operation)||process.argv.length!==3)throw Error('Usage: preview-s10-local.mjs create|cleanup');
const {admin}=localClients();const ok=r=>{if(r.error)throw Error('Own S10 fixture operation failed');return r.data;};
if(operation==='create'){
 try{await readFile(stateFile);throw Error('Clean previous S10 preview first');}catch(e){if(e.code!=='ENOENT')throw e;}
 const sources=[randomUUID(),randomUUID()],events=[randomUUID(),randomUUID()],occurrences=[randomUUID(),randomUUID()];const city=ok(await admin.from('territories').select('id').eq('external_id','madrid:municipio:Madrid').single()).id;
 await writeFile(stateFile,JSON.stringify({sources,events,occurrences}),{flag:'wx',mode:0o600});const start_at=new Date(Date.now()+5*86400000).toISOString();
 for(let i=0;i<2;i++){
  ok(await admin.from('sources').insert({id:sources[i],code:'qa-s10-'+i,name:'TEST S10 synthetic '+i,url:'https://fixture.invalid/s10-'+i,acquisition:'fixture',terms_status:'allowed',allow_cache:true,last_success_at:new Date().toISOString(),poll_enabled:false,coverage_note:'Synthetic browser QA only. No real provider integration.'}));
  ok(await admin.from('events').insert({id:events[i],primary_source_id:sources[i],canonical_url:'https://fixture.invalid/s10-event-'+i,checked_at:new Date().toISOString(),title:'ТЕСТ S10 — тимчасова перевірка',venue:'Тестовий майданчик',category_code:'music',territory_id:city,location:'SRID=4326;POINT(-3.7 40.4)'}));
  ok(await admin.from('occurrences').insert({id:occurrences[i],event_id:events[i],external_id:'s10-browser-'+i,time_kind:'known',start_at,timezone:'Europe/Madrid'}));
  ok(await admin.from('s10_provider_facts').insert({occurrence_id:occurrences[i],checked_at:new Date().toISOString(),record:{category_code:'music',title:'ТЕСТ S10 — тимчасова перевірка',venue:'Тестовий майданчик',status:'scheduled',price:null,currency:null,occurrences:[{time_kind:'known',start_at,end_at:null,local_date:null,timezone:'Europe/Madrid'}]}}));
 }
 const sorted=[...occurrences].sort();ok(await admin.from('duplicate_candidates').insert({left_occurrence:sorted[0],right_occurrence:sorted[1]}));console.log(JSON.stringify({synthetic:true,occurrences,no_owner_saved_changes:true}));
}else{
 const {sources,events,occurrences}=JSON.parse(await readFile(stateFile,'utf8'));
 for(const id of [...sources,...events,...occurrences])if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid own fixture ID');
 for(let i=0;i<sources.length;i++){
  const source=ok(await admin.from('sources').select('name,url').eq('id',sources[i]).maybeSingle());if(source&&(source.name!=='TEST S10 synthetic '+i||source.url!=='https://fixture.invalid/s10-'+i))throw Error('Not our fixture');
 }
 ok(await admin.from('s10_audit').delete().in('target',occurrences));ok(await admin.from('s8_correction_log').delete().in('occurrence_id',occurrences));
 for(let i=0;i<events.length;i++)ok(await admin.from('events').delete().eq('id',events[i]).eq('primary_source_id',sources[i]));
 ok(await admin.from('sources').delete().in('id',sources).like('name','TEST S10 synthetic %'));await unlink(stateFile);console.log(JSON.stringify({own_synthetic_preview_removed:true}));
}
