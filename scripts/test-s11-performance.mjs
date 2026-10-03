// Explicit synthetic, schema-only disposable PostgreSQL. No managed user/event data copied.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const container = 'supabase_db_event-radar-local';
const database = 'event_radar_s11_test_' + randomBytes(8).toString('hex');
const owner = randomUUID(), source = randomUUID(); let created = false; let checks = 0;
const check = value => { assert.ok(value); checks++; };
function docker(args, input = '') {
 return new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(120000) });
  let output = '', errors = '';
  child.stdout.on('data', value => { output += value; if (output.length > 16 * 1024 * 1024) child.kill(); });
  child.stderr.on('data', value => errors = (errors + value).slice(-3000));
  child.on('error', () => reject(Error('Own S11 database unavailable')));
  child.on('close', code => code === 0 ? resolve(output) : reject(Error('Own S11 command failed: ' + errors)));
  child.stdin.on('error', () => {}); child.stdin.end(input);
 });
}
const sql = query => docker(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], query);
const explain = async query => JSON.parse((await sql('explain(analyze,buffers,format json) ' + query)).trim())[0];
const shapes = plan => [plan['Node Type'] + (plan['Index Name'] ? ':' + plan['Index Name'] : ''), ...(plan.Plans ?? []).flatMap(shapes)];
try {
 await docker(['exec', container, 'createdb', '-U', 'postgres', database]); created = true;
 const schema = await docker(['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', 'postgres']);
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension postgis with schema extensions;\n' + schema.replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;').replace(/^ALTER DEFAULT PRIVILEGES[^\n]*\n/gm, ''));
 await sql(`insert into public.timezone_names(name) select name from pg_catalog.pg_timezone_names;
 insert into public.s6_ai_settings(singleton) values(true);insert into public.s9_config(id) values(true);
 insert into auth.users(id,email) values('${owner}','synthetic-s11@fixture.invalid');
 set request.jwt.claim.sub='${owner}';`);
 console.log((await sql(await readFile('supabase/tests/s11_invariants.sql','utf8'))).trim());
 check((await sql(`set request.jwt.claim.sub='${owner}';select public.record_s11_metric('event_saved');`)).trim() === 'f');
 await sql(`set request.jwt.claim.sub='${owner}';select public.set_s11_metrics(true);
 select public.record_s11_metric('event_saved') from generate_series(1,1200);`);
 check(Number((await sql(`select count from public.s11_metrics where user_id='${owner}';`)).trim()) === 1000);
 await sql(`insert into public.s11_metrics values('${owner}',(now() at time zone 'UTC')::date-30,'rule_created',1);
 insert into public.s11_metrics values('${owner}',(now() at time zone 'UTC')::date-29,'rule_created',1);
 select public.prune_s11_metrics();`);
 check(Number((await sql('select count(*) from public.s11_metrics;')).trim()) === 2);
 await sql(`select public.set_s10_role('${owner}','viewer','SYNTHETIC S11 metrics report');`);
 const report=JSON.parse((await sql(`set request.jwt.claim.sub='${owner}';select public.s11_metrics_report();`)).trim());
 check(report.length===2 && report.every(row=>Object.keys(row).sort().join(',')==='count,day,kind'));
 check(report.reduce((sum,row)=>sum+row.count,0)===1001);
 check((await sql("select not has_function_privilege('anon','public.record_s11_metric(text)','execute') and not has_function_privilege('authenticated','public.prune_s11_metrics()','execute') and not has_table_privilege('authenticated','public.s11_metrics','insert');")).trim() === 't');
 // Observe record holding the preference lock before launching opt-out. Always drain both connections.
 const first = sql(`set application_name='s11-record';set request.jwt.claim.sub='${owner}';begin;select public.record_s11_metric('digest_opened');select pg_sleep(2);commit;`);
 const firstResult = Promise.allSettled([first]); let secondResult; let overlap = false;
 try {
  for (let n = 0; n < 40; n++) {
   if ((await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='s11-record' and wait_event='PgSleep';")).trim() === '1') break;
   await sleep(50);
  }
  secondResult = Promise.allSettled([sql(`set application_name='s11-optout';set request.jwt.claim.sub='${owner}';select public.set_s11_metrics(false);`)]);
  for (let n = 0; n < 40; n++) {
   if ((await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='s11-optout' and wait_event_type='Lock';")).trim() === '1') { overlap = true; break; }
   await sleep(50);
  }
 } finally {
  const firstSettled=await firstResult;const secondSettled=secondResult?await secondResult:[];
  check(firstSettled.every(r => r.status === 'fulfilled'));
  if (secondResult) check(secondSettled.every(r => r.status === 'fulfilled'));
 }
 check(overlap);
 check((await sql(`set request.jwt.claim.sub='${owner}';select not public.s11_metrics_enabled() and not exists(select 1 from public.s11_metrics where user_id='${owner}');`)).trim() === 't');

 // 100k deterministic city-clustered records: 20% unknown points, 10% past,
 // 10% date-only, 10% unknown time, mixed categories/languages/prices. All labelled synthetic.
 await sql(`insert into public.categories(code,names) values('music','{"en":"Music"}'),('culture','{"en":"Culture"}');
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,last_success_at)
 values('${source}','SYNTHETIC S11 benchmark','https://fixture.invalid/synthetic-s11','api','allowed',true,now());
 create table public.s11_benchmark_fixture(n integer primary key,id uuid not null);
 insert into public.s11_benchmark_fixture select n,gen_random_uuid() from generate_series(1,100000) n;
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title,category_code,original_language,event_language,venue,location,price,currency)
 select id,'${source}','https://fixture.invalid/synthetic-s11/'||n,now(),'SYNTHETIC S11 event '||n,
 case when n%2=0 then 'music' else 'culture' end,'en',case when n%4=0 then null else 'en' end,'SYNTHETIC venue',
 case when n%5=0 then null else extensions.st_setsrid(extensions.st_makepoint(
 case n%3 when 0 then -3.7 when 1 then -79.38 else 24.94 end + ((n*17%1000)-500)*0.0008,
 case n%3 when 0 then 40.42 when 1 then 43.65 else 60.17 end + ((n*31%1000)-500)*0.0008),4326)::extensions.geography end,
 case when n%4=0 then null else (n%100)::numeric end,case when n%4=0 then null else 'EUR' end from public.s11_benchmark_fixture;
 insert into public.occurrences(event_id,external_id,time_kind,start_at,local_date,timezone)
 select id,n::text,case when n%10=1 then 'date_only' when n%10=2 then 'unknown' else 'known' end,
 case when n%10 not in (1,2) then now()+make_interval(days=>case when n%10=0 then -(n%30+1) else n%90+1 end) end,
 case when n%10=1 then current_date+n%90+1 end,
 case n%3 when 0 then 'Europe/Madrid' when 1 then 'America/Toronto' else 'Europe/Helsinki' end from public.s11_benchmark_fixture;
 set request.jwt.claim.sub='${owner}';select public.save_s4_rule('{"name":"SYNTHETIC S11 radius","enabled":true,"timezone":"Europe/Madrid","filters":{"scope":"s4","categories":[],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true},"event_horizon":{"kind":"days","days":30},"areas":[{"kind":"radius","parameters":{"longitude":-3.7,"latitude":40.42,"meters":10000}}]}');
 analyze public.events;analyze public.occurrences;analyze public.rules;analyze public.rule_areas;
 analyze public.sources;`);
 check((await sql('select count(*) from public.events;')).trim() === '100000');
 const workloads = {
  radius_10km: "select count(*) from public.events where extensions.st_dwithin(location,extensions.st_setsrid(extensions.st_makepoint(-3.7,40.42),4326)::extensions.geography,10000)",
  polygon_madrid: "select count(*) from public.events where location && extensions.st_makeenvelope(-3.8,40.32,-3.6,40.52,4326)::extensions.geography and extensions.st_covers(extensions.st_makeenvelope(-3.8,40.32,-3.6,40.52,4326),location::extensions.geometry)",
  full_current_matcher: `select count(*) from public.s7_matches('${owner}',null,now())`,
  catalog_page: 'select public.list_s5_events()'
 };
 const results = {};
 for (const [name, query] of Object.entries(workloads)) {
  const measurements = [];
  for (let n = 0; n < 5; n++) measurements.push(await explain(query));
  const sorted = measurements.map(p => p['Execution Time']).sort((a,b) => a-b);
  const selected=name==='catalog_page'?JSON.parse((await sql(query)).trim()).total:Number((await sql(query)).trim());check(selected>0);
  results[name] = { selected_count: selected, execution_ms: measurements.map(p => p['Execution Time']), median_ms: sorted[2], max_ms: sorted[4], first_observed_ms: measurements[0]['Execution Time'], planning_ms: measurements.map(p => p['Planning Time']), plan_nodes: shapes(measurements[0].Plan), shared_hit_blocks: measurements[0].Plan['Shared Hit Blocks'], shared_read_blocks: measurements[0].Plan['Shared Read Blocks'] };
 }
 check(results.radius_10km.plan_nodes.some(v => v.includes('events_location_idx')));
 check(results.polygon_madrid.plan_nodes.some(v => v.includes('events_location_idx')));
 const runtime=JSON.parse((await sql("select jsonb_build_object('postgres',version(),'postgis',extensions.postgis_lib_version());")).trim());
 console.log(JSON.stringify({ checks, runtime, synthetic: true, rows: 100000, known_points: 80000, database: 'isolated schema-only clone', native_latency_verified: false, first_is_not_cold_io: true, samples_per_query: 5, metrics_optout_observed_lock: overlap, results }));
} finally {
 if (created) { assert.match(database, /^event_radar_s11_test_[a-f0-9]{16}$/); await docker(['exec', container, 'dropdb', '-U', 'postgres', database]); }
 console.log(JSON.stringify({ own_synthetic_database_removed: created }));
}
