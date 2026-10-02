// Real Postgres concurrency in a disposable schema-only database. No provider calls/user data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const container = 'supabase_db_event-radar-local';
const database = 'event_radar_s7_test_' + randomBytes(8).toString('hex');
assert.match(database, /^event_radar_s7_test_[a-f0-9]{16}$/);
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
  `set application_name='s7-race-${index}'; begin; select ${query}; select pg_sleep(2); commit;`)));
 let lockObserved = false;
 let observationError;
 try {
  for (let attempt = 0; attempt < 20; attempt++) {
   await sleep(50);
   const count = await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name in ('s7-race-0','s7-race-1') and state='active';");
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
 const invariantLog = await sql(await readFile('supabase/tests/s7_invariants.sql', 'utf8'));
 const invariantResult = JSON.parse(invariantLog.trim());
 check(invariantResult.invariant_checks >= 40);
 console.log(JSON.stringify(invariantResult));
 const owner = randomUUID(); const source = randomUUID(); const territory = randomUUID();
 const event = randomUUID(); const occurrence = randomUUID(); const rule = randomUUID(); const device = randomUUID();
 await sql(`insert into auth.users(id,email) values('${owner}','s7-isolated@fixture.invalid');
 insert into public.territories(id,country_code,external_id,kind,names,provenance) values('${territory}','ZZ','s7-isolated','city','{"en":"Synthetic city"}','synthetic');
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,last_success_at) values('${source}','S7 synthetic','https://fixture.invalid/','fixture','allowed',true,now());
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title,territory_id) values('${event}','${source}','https://fixture.invalid/1',now(),'Synthetic S7','${territory}');
 insert into public.occurrences(id,event_id,external_id,time_kind,start_at,timezone) values('${occurrence}','${event}','synthetic','known',now()+interval '2 days','UTC');
 insert into public.rules(id,user_id,name,enabled,filters,event_horizon,delivery_schedule,timezone) values('${rule}','${owner}','Synthetic rule',true,
 '{"scope":"s4","categories":[],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true}',
 '{"kind":"days","days":14}','{"mode":"daily","active":true,"time":"18:00"}','UTC');
 insert into public.rule_areas(rule_id,user_id,kind,territory_id) values('${rule}','${owner}','city','${territory}');
 update public.rules set next_run_at=now()-interval '1 minute' where id='${rule}';
 update public.profiles set push_enabled=true where id='${owner}';
 insert into public.device_tokens(id,user_id,token,platform) values('${device}','${owner}','ExpoPushToken[s7IsolatedFixture123]','ios');`);
 const scheduled = await race('public.run_s7_scheduler()', 'public.run_s7_scheduler()');
 check(scheduled.map(r => r.status).sort().join(',') === 'idle,ready');
 check(Number((await sql('select count(*) from public.digests;')).trim()) === 1);
 check(Number((await sql('select count(*) from public.digest_items;')).trim()) === 1);
 const claims = await race('public.claim_s7_notification()', 'public.claim_s7_notification()');
 check(claims.map(r => r.status).sort().join(',') === 'claimed,idle');
 const claimed = claims.find(r => r.status === 'claimed');
 const start = `public.begin_s7_delivery('${claimed.id}','${claimed.token}','${device}')`;
 const begun = await race(start, start);
 check(begun.map(r => r.status).sort().join(',') === 'already_attempted,dispatch');
 const delivery = begun.find(r => r.status === 'dispatch');
 const finish = `public.finish_s7_delivery('${delivery.delivery_id}','${claimed.token}','fixture_recorded')`;
 const finished = await race(finish, finish);
 check(finished.sort().join(',') === 'f,t');
 check(Number((await sql('select count(*) from public.deliveries;')).trim()) === 1);
 await sql(`select public.finish_s7_notification('${claimed.id}','${claimed.token}');`);
 check(JSON.parse((await sql('select public.run_s7_scheduler();')).trim()).status === 'idle');
 console.log(JSON.stringify({ concurrency_checks: checks, independent_postgres_connections: true, observed_overlaps: 4,
  scheduler_race: 'one logical digest', transport_race: 'one fenced dispatch', synthetic_invariants: 'PASS',
  schema_only_copy: true, user_data_copied: false, expo_requests: 0, device_delivery_verified: false }));
} finally {
 if (created) {
  await docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
  console.log(JSON.stringify({ disposable_database_removed: true }));
 }
}
