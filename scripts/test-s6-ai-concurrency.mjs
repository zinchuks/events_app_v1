// Real Postgres concurrency in a disposable schema-only database. No provider calls/user data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const container = 'supabase_db_event-radar-local';
const database = 'event_radar_s6_ai_test_' + randomBytes(8).toString('hex');
assert.match(database, /^event_radar_s6_ai_test_[a-f0-9]{16}$/);
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
  `set application_name='s6-ai-race-${index}'; begin; select ${query}; select pg_sleep(2); commit;`)));
 let lockObserved = false;
 let observationError;
 try {
  for (let attempt = 0; attempt < 20; attempt++) {
   await sleep(50);
   const count = await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name in ('s6-ai-race-0','s6-ai-race-1') and wait_event_type='Lock';");
   if (Number(count.trim()) > 0) { lockObserved = true; break; }
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
 const schema = await docker(['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', 'postgres']);
 await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension postgis with schema extensions;\n'
  + schema.replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;'));
 const source = randomUUID(); const first = randomUUID(); const second = randomUUID();
 await sql(`insert into public.s6_ai_settings(singleton,enabled,provider,model_id,locales,currency,daily_limit,request_ceiling,pricing_verified_at)
 values(true,true,'fixture-provider','fixture-model-not-real',array['uk'],'USD',1,0.6,now());
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,allow_translate,last_success_at)
 values('${source}','S6 AI isolated concurrency fixture','https://fixture.invalid/','fixture','allowed',true,true,now());
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title,description)
 values('${first}','${source}','https://fixture.invalid/1',now(),'Fixture one','Original'),
 ('${second}','${source}','https://fixture.invalid/2',now(),'Fixture two','Original');`);
 const reserve = event => `public.reserve_s6_ai('${event}','uk')`;
 const different = await race(reserve(first), reserve(second));
 check(different.map(result => result.status).sort().join(',') === 'budget_exhausted,reserved');
 check(Number((await sql('select committed from public.s6_ai_days;')).trim()) === 0.6);
 check(Number((await sql('select count(*) from public.s6_ai_requests;')).trim()) === 1);
 await sql('truncate public.s6_ai_requests,public.s6_ai_days;');
 const same = await race(reserve(first), reserve(first));
 check(same.map(result => result.status).sort().join(',') === 'in_progress,reserved');
 check(same[0].request_id === same[1].request_id);
 const reservation = same.find(result => result.status === 'reserved');
 check(!same.find(result => result.status === 'in_progress').token);
 check(Number((await sql('select committed from public.s6_ai_days;')).trim()) === 0.6);
 const dispatch = `public.begin_s6_ai('${reservation.request_id}','${reservation.token}')`;
 const starts = await race(dispatch, dispatch);
 check(starts.filter(Boolean).length === 1);
 const output = '{"title":"Synthetic translation","description":"Synthetic text","summary":"Synthetic summary"}';
 const finish = cost => `public.finish_s6_ai('${reservation.request_id}','${reservation.token}','ready','${output}',${cost})`;
 const finishes = await race(finish(0.2), finish(0.3));
 check(finishes.every(result => result === 'ready'));
 const charged = Number((await sql('select committed from public.s6_ai_days;')).trim());
 check(charged === 0.2 || charged === 0.3);
 check(Number((await sql('select charge from public.s6_ai_requests;')).trim()) === charged);
 check(Number((await sql('select count(*) from public.translations;')).trim()) === 1);
 check(JSON.parse((await sql(`select ${reserve(first)};`)).trim()).status === 'cached');
 console.log(JSON.stringify({ checks, independent_postgres_connections: true, observed_lock_waits: 4,
  different_key_budget_race: 'one reservation / one cap rejection', same_key_race: 'one reservation',
  dispatch_race: 'one dispatch', settlement_race: 'one charge / one cache row',
  schema_only_copy: true, user_data_copied: false, provider: 'synthetic fixture only', ai_requests: 0 }));
} finally {
 if (created) {
  // Only the unique database successfully created by this process; never the user's postgres database.
  await docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
  console.log(JSON.stringify({ disposable_database_removed: true }));
 }
}
