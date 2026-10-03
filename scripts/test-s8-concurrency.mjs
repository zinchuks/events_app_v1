// Real Postgres concurrency in a disposable schema-only database. No provider calls/user data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const container = 'supabase_db_event-radar-local';
const database = 'event_radar_s8_test_' + randomBytes(8).toString('hex');
assert.match(database, /^event_radar_s8_test_[a-f0-9]{16}$/);
let created = false;
let checks = 0;
function check(value) { assert.ok(value); checks++; }

function docker(args, input = '') {
 return new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(120000) });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', value => { stdout += value; if (stdout.length > 32 * 1024 * 1024) child.kill(); });
  child.stderr.on('data', value => { stderr = (stderr + value).slice(-2000); });
  child.on('error', () => reject(Error('Disposable PostgreSQL command unavailable')));
  child.on('close', code => code === 0 ? resolve(stdout) : reject(Error('Disposable PostgreSQL command failed: ' + stderr.split('\n').find(line => line.includes('ERROR:')))));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
 });
}
function sql(query) {
 return docker(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], query);
}
async function race(queryA, queryB) {
 const running = Promise.allSettled([queryA, queryB].map((query, index) => sql(
  `set application_name='s8-race-${index}'; begin; select ${query}; select pg_sleep(2); commit;`)));
 let lockObserved = false;
 let observationError;
 try {
  for (let attempt = 0; attempt < 20; attempt++) {
   await sleep(50);
   const count = await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name in ('s8-race-0','s8-race-1') and state='active';");
   if (Number(count.trim()) === 2) { lockObserved = true; break; }
  }
 } catch (error) { observationError = error; }
 const results = await running; // Drain both processes before cleanup, including a failed assertion/operation.
 if (observationError) throw observationError;
 for (const result of results) if (result.status === 'rejected') throw result.reason;
 check(lockObserved);
 return results.map(result => {
  const lines = result.value.trim().split('\n').map(line => line.trim()).filter(Boolean);
  return lines[0] === 'null' ? null : lines[0]?.startsWith('{') ? JSON.parse(lines[0]) : lines[0] ?? null;
 });
}

try {
 await docker(['exec', container, 'createdb', '-U', 'postgres', database]); created = true;
 const schema = await docker(['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', 'postgres']);
 await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension postgis with schema extensions;\n'
  + schema.replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;').replace(/^ALTER DEFAULT PRIVILEGES[^\n]*\n/gm, ''));
 // Lookup inventory is static metadata, never private user data.
 await sql("insert into public.timezone_names(name) select name from pg_catalog.pg_timezone_names;");
 const invariantLog = await sql(await readFile('supabase/tests/s8_invariants.sql', 'utf8'));
 const invariantResult = JSON.parse(invariantLog.trim());
 check(invariantResult.invariant_checks >= 30);
 console.log(JSON.stringify(invariantResult));
 const owner = randomUUID(); const source = randomUUID(); const event = randomUUID(); const occurrence = randomUUID();
 await sql(`insert into auth.users(id,email) values('${owner}','s8-isolated@fixture.invalid');
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,last_success_at) values('${source}','S8 synthetic','https://fixture.invalid/','fixture','allowed',true,now());
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title) values('${event}','${source}','https://fixture.invalid/1',now(),'Synthetic S8');
 insert into public.occurrences(id,event_id,external_id,time_kind,start_at,timezone) values('${occurrence}','${event}','synthetic','known',now()+interval '2 days','UTC');
 insert into public.saved_events(user_id,occurrence_id) values('${owner}','${occurrence}');`);
 const mutations = await race(`public.correct_s8_occurrence('${occurrence}','{"title":"Concurrent synthetic"}','Synthetic concurrency correction')`, `public.correct_s8_occurrence('${occurrence}','{"title":"Concurrent synthetic"}','Synthetic concurrency correction')`);
 check(mutations.length === 2);
 check(Number((await sql('select count(*) from public.s8_alerts;')).trim()) === 1);
 const scheduled = await race('public.run_s8_scheduler()', 'public.run_s8_scheduler()');
 check(scheduled.map(r => r.status).sort().join(',') === 'idle,published');
 check(Number((await sql('select count(*) from public.digests;')).trim()) === 1);
 check(Number((await sql('select count(*) from public.notification_jobs;')).trim()) === 1);
 // A real lead becomes due by wall clock, without forcing run_at or changing DB time.
 const timedEvent=randomUUID();const timedOccurrence=randomUUID();
 await sql(`insert into public.events(id,primary_source_id,canonical_url,checked_at,title) values('${timedEvent}','${source}','https://fixture.invalid/timed',now(),'Synthetic timed reminder');
 insert into public.occurrences(id,event_id,external_id,time_kind,start_at,timezone) values('${timedOccurrence}','${timedEvent}','timed','known',now()+interval '5 minutes 3 seconds','UTC');
 insert into public.saved_events(user_id,occurrence_id) values('${owner}','${timedOccurrence}');
 set request.jwt.claim.sub='${owner}';select public.set_s8_saved_preferences('${timedOccurrence}',array[5],true,'UTC',null);`);
 check(Number((await sql("select count(*) from public.s8_alerts where kind='reminder' and run_at>now();")).trim())===1);
 await sleep(4000);
 const timed=await race('public.run_s8_scheduler()','public.run_s8_scheduler()');
 check(timed.map(r=>r.status).sort().join(',')==='idle,published');
 check(timed.find(r=>r.status==='published').kind==='reminder');
 check(Number((await sql('select count(*) from public.digests;')).trim())===2);
 // Import and correction both use the same source advisory lock. Preserve overlay in either commit order.
 const importOwner=randomUUID();const importSource=randomUUID();
 await sql(`insert into auth.users(id,email) values('${importOwner}','s8-import-race@fixture.invalid');
 insert into public.sources(id,code,name,url,acquisition,terms_status,allow_cache,poll_interval_seconds,last_success_at) values('${importSource}','madrid','Synthetic import race','https://fixture.invalid/race-source','fixture','allowed',true,86400,now());
 select public.ingest_s6_source('madrid',jsonb_build_array(jsonb_build_object('external_id','s8-race-import','hash',repeat('a',64),'title','Synthetic source title','url','https://www.madrid.es/fixture-s8-race',
 'occurrences',jsonb_build_array(jsonb_build_object('external_id','s8-race-import','time_kind','known','timezone','Europe/Madrid','start_at',now()+interval '8 days')))),now(),public.claim_s6_source('madrid',true),'{}');`);
 const importOccurrence=(await sql("select id from public.occurrences where external_id='s8-race-import';")).trim();
 await sql(`insert into public.saved_events(user_id,occurrence_id) values('${importOwner}','${importOccurrence}');`);
 const batchSql=`jsonb_build_array(jsonb_build_object('external_id','s8-race-import','hash',repeat('a',64),'title','Synthetic source title','url','https://www.madrid.es/fixture-s8-race',
 'occurrences',jsonb_build_array(jsonb_build_object('external_id','s8-race-import','time_kind','known','timezone','Europe/Madrid','start_at',now()+interval '8 days'))))`;
 await race(`public.ingest_s6_source('madrid',${batchSql},now(),public.claim_s6_source('madrid',true),'{}')`, `public.correct_s8_occurrence('${importOccurrence}','{"title":"Synthetic race correction"}','Synthetic importer correction race')`);
 check((await sql(`select title from public.events where id=(select event_id from public.occurrences where id='${importOccurrence}');`)).trim()==='Synthetic race correction');
 check(Number((await sql(`select count(*) from public.s8_corrections where occurrence_id='${importOccurrence}';`)).trim())===1);
 console.log(JSON.stringify({ concurrency_checks: checks, independent_postgres_connections: true, observed_overlaps: 4, import_correction_race: true, actual_timed_reminder: true,
  correction_race: 'one logical update', scheduler_race: 'one inbox/job', schema_only_copy:true,user_data_copied:false,expo_requests:0,device_delivery_verified:false }));
} finally {
 if (created) {
  await docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
  console.log(JSON.stringify({ disposable_database_removed: true }));
 }
}
