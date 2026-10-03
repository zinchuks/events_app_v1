// Real Postgres concurrency in a disposable schema-only database. No provider calls/user data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const container = 'supabase_db_event-radar-local';
const database = 'event_radar_s9_test_' + randomBytes(8).toString('hex');
assert.match(database, /^event_radar_s9_test_[a-f0-9]{16}$/);
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
  `set application_name='s9-race-${index}'; begin; select ${query}; select pg_sleep(2); commit;`)));
 let lockObserved = false;
 let observationError;
 try {
  for (let attempt = 0; attempt < 20; attempt++) {
   await sleep(50);
   const count = await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name in ('s9-race-0','s9-race-1') and state='active';");
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
 await sql('insert into public.s9_config(id) values(true);');
 const invariantLog = await sql(await readFile('supabase/tests/s9_invariants.sql', 'utf8'));
 const invariantResult = JSON.parse(invariantLog.trim());
 check(invariantResult.invariant_checks >= 35);
 console.log(JSON.stringify(invariantResult));
 const owner=randomUUID();
 await sql(`insert into auth.users(id,email) values('${owner}','s9-race@fixture.invalid');
 update public.s9_config set enabled=true,entitlement_id='fixture-plus',product_ids=array['fixture-month'],app_ids=array['fixture-app'];`);
 const enqueued=await race(`public.enqueue_s9_reconcile('${owner}','same-fixture-webhook')`,`public.enqueue_s9_reconcile('${owner}','same-fixture-webhook')`);
 check(enqueued.sort().join(',')==='f,t');
 check(Number((await sql('select count(*) from public.s9_webhook_events;')).trim())===1);
 const claimed=await race('public.claim_s9_reconcile()','public.claim_s9_reconcile()');
 check(claimed.map(r=>r.status).sort().join(',')==='claimed,idle');
 const nonce=claimed.find(r=>r.status==='claimed').claim;
 const snapshotSql="jsonb_build_object('tier','plus','expires_at',now()+interval '2 days','observed_at',now(),'environment','SANDBOX')";
 const finished=await race(`public.finish_s9_reconcile('${owner}','${nonce}',${snapshotSql})`,`public.finish_s9_reconcile('${owner}','${nonce}',${snapshotSql})`);
 check(finished.sort().join(',')==='f,t');
 check((await sql(`select public.s9_tier('${owner}');`)).trim()==='plus');
 await sql(`update public.entitlements set expires_at=clock_timestamp()+interval '2 seconds',grace_until=null where user_id='${owner}';`);
 check((await sql(`select public.s9_tier('${owner}');`)).trim()==='plus');
 await sleep(3000);
 check((await sql(`select public.s9_tier('${owner}');`)).trim()==='free');
 console.log(JSON.stringify({concurrency_checks:checks,observed_overlaps:3,independent_postgres_connections:true,actual_clock_expiry:true,schema_only_copy:true,user_data_copied:false,provider_requests:0,store_purchases_verified:false}));
} finally {
 if(created){await docker(['exec',container,'dropdb','-U','postgres',database]);console.log(JSON.stringify({disposable_database_removed:true}));}
}
