// Read-only verification of real sources through local PostgREST/anon RLS.
import assert from 'node:assert/strict';
import { localClients } from './lib/local-clients.mjs';
const {admin,client}=localClients();const anon=client();let checks=0;
function ok(result){assert.equal(result.error,null,result.error?.code);checks++;return result.data;}
function check(value){assert.ok(value);checks++;}
const coverage=ok(await anon.rpc('s6_source_coverage'));
assert.deepEqual(coverage.map(s=>s.code),['helsinki','madrid','toronto']);checks++;
for(const source of coverage){check(source.fresh&&source.future_sessions>0&&source.mapped>0&&source.known_prices>0);check(source.mapped<=source.future_sessions&&source.known_prices<=source.future_sessions);}
const sources=ok(await admin.from('sources').select('id,code').in('code',['helsinki','madrid','toronto']));
for(const source of sources){
 const records=ok(await admin.from('source_records').select('external_id,event_sources(occurrences(id,event_id,events(version,location,price)))').eq('source_id',source.id));
 check(records.length>0&&new Set(records.map(r=>r.external_id)).size===records.length);
 check(records.every(r=>r.event_sources.length===1&&r.event_sources[0].occurrences?.events?.version>0));
}
const translations=ok(await anon.from('translations').select('event_id,version,locale,provider,title,description').eq('provider','source:helsinki').limit(20));check(translations.length>0);
for(const row of translations){const event=ok(await anon.from('events').select('version').eq('id',row.event_id).single());check(event.version===row.version&&row.locale==='en'&&Boolean(row.title&&row.description));}
for(const table of ['source_records','ingestion_runs','source_poll_state','duplicate_candidates']){check(Boolean((await anon.from(table).select('*').limit(1)).error));}
check(Boolean((await anon.rpc('claim_s6_source',{source_code:'madrid',force_poll:true})).error));
const feed=ok(await anon.rpc('list_s5_events',{page_size:1000}));check(feed.total>100&&feed.mapped>0);
check(feed.items.some(row=>row.longitude!==null&&row.latitude!==null));
console.log(JSON.stringify({checks,coverage,source_native_translations:translations.length,ai_requests:0,native:'unverified'}));
