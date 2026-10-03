// Schema clone, synthetic fixtures, genuine PostgreSQL concurrency and binary backup/restore.
// Never dumps managed user data; neither source nor restore target is postgres.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const container = 'supabase_db_event-radar-local';
const suffix = randomBytes(8).toString('hex');
const database = 'event_radar_s10_test_' + suffix;
const restored = 'event_radar_s10_restore_' + suffix;
const created = [];
let checks = 0;
const check = v => { assert.ok(v); checks++; };
function docker(args, input = '', binary = false) { return new Promise((resolve, reject) => { const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(120000) }); const chunks = []; let size = 0; let errors = ''; child.stdout.on('data', v => { size += v.length; if (size > 32 * 1024 * 1024)
    child.kill(); chunks.push(v); }); child.stderr.on('data', v => errors = (errors + v).slice(-3000)); child.on('error', () => reject(Error('Own test PostgreSQL unavailable'))); child.on('close', code => code === 0 ? resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')) : reject(Error('Own test command failed: ' + errors.split('\n').filter(l => l.includes('ERROR:')||l.includes('CONTEXT:')).join('\n')))); child.stdin.on('error', () => { }); child.stdin.end(input); }); }
const sql = (query, db = database) => docker(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], query);
try {
    await docker(['exec', container, 'createdb', '-U', 'postgres', database]);
    created.push(database);
    const schema = await docker(['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', 'postgres']);
    await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension postgis with schema extensions;\n' + schema.replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;').replace(/^ALTER DEFAULT PRIVILEGES[^\n]*\n/gm, ''));
    await sql("insert into public.timezone_names(name) select name from pg_catalog.pg_timezone_names;insert into public.s6_ai_settings(singleton) values(true);insert into public.s9_config(id) values(true);insert into public.categories(code,names) values('music','{\"en\":\"Music\"}');");
    const result = JSON.parse((await sql(await readFile('supabase/tests/s10_invariants.sql', 'utf8'))).trim());
    check(result.invariant_checks >= 30);
    console.log(JSON.stringify(result));
    const owner = randomUUID(), src = randomUUID(), e = randomUUID(), o = randomUUID();
    await sql(`insert into auth.users(id,email) values('${owner}','restore-s10@fixture.invalid');select public.set_s10_role('${owner}','admin','Own synthetic restore fixture');
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,last_success_at) values('${src}','Synthetic restore source','https://fixture.invalid/restore','api','allowed',true,now());
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title) values('${e}','${src}','https://fixture.invalid/restore',now(),'Synthetic restore event');
 insert into public.occurrences(id,event_id,external_id,time_kind,start_at,timezone) values('${o}','${e}','restore','known',now()+interval '5 days','UTC');
 insert into public.saved_events(user_id,occurrence_id) values('${owner}','${o}');set request.jwt.claim.sub='${owner}';select public.set_s8_saved_preferences('${o}',array[120],true,'UTC',null);`);
    const running = Promise.allSettled([1, 2].map(n => sql(`set application_name='s10-race-${n}';set request.jwt.claim.sub='${owner}';begin;select public.s10_correct('${o}',1,'{"title":"Synthetic concurrent correction ${n}"}','Own synthetic concurrent correction');select pg_sleep(2);commit;`)));
    let overlap = false;
    let observationError;
    try {
        for (let attempt = 0; attempt < 30; attempt++) {
            await sleep(50);
            if (Number((await sql("select count(*) from pg_stat_activity where datname=current_database() and application_name like 's10-race-%' and state='active';")).trim()) === 2) { overlap = true; break; }
        }
    } catch (error) { observationError = error; }
    const race = await running; // Always drain both connections before dropping own DB, even after an observer failure.
    if (observationError) throw observationError;
    check(overlap);
    check(race.filter(r => r.status === 'fulfilled').length === 1);
    check(race.filter(r => r.status === 'rejected').length === 1);
    check(Number((await sql("select count(*) from public.s10_audit where action='event_correct';")).trim()) === 1);
    // Flush deferred saved/change triggers before backup. Custom archive stays only in memory, never repository.
    const fingerprintQuery = `select jsonb_build_object('events',(select jsonb_agg(to_jsonb(x) order by id) from public.events x),'saved',(select jsonb_agg(to_jsonb(x) order by occurrence_id) from public.saved_events x),'alerts',(select jsonb_agg(to_jsonb(x) order by id) from public.s8_alerts x),'overrides',(select jsonb_agg(to_jsonb(x) order by occurrence_id) from public.s8_corrections x),'audit',(select jsonb_agg(to_jsonb(x) order by id) from public.s10_audit x),'roles',(select jsonb_agg(to_jsonb(x) order by user_id) from public.s10_roles x));`;
    const before = (await sql(fingerprintQuery)).trim();
    const archive = await docker(['exec', container, 'pg_dump', '-U', 'postgres', '--format=custom', '--no-owner', '--exclude-table-data=public.timezone_names', '--schema=public', '--schema=auth', database], '', true);
    check(archive.subarray(0, 5).toString() === 'PGDMP');
    await docker(['exec', container, 'createdb', '-U', 'postgres', restored]);
    created.push(restored);
    await sql('drop schema public;create schema extensions;create extension pgcrypto with schema extensions;create extension postgis with schema extensions;', restored);
    await docker(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '--no-owner', '--exit-on-error', '--section=pre-data', '--dbname=' + restored], archive);
    // CHECK valid_timezone reads an inventory; restore it before dependent row data.
    await sql('insert into public.timezone_names(name) select name from pg_catalog.pg_timezone_names;', restored);
    await docker(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '--no-owner', '--exit-on-error', '--section=data', '--section=post-data', '--dbname=' + restored], archive);
    check((await sql(fingerprintQuery, restored)).trim() === before);
    check((await sql(`set request.jwt.claim.sub='${owner}';select public.s10_dashboard()->>'role';`, restored)).trim() === 'admin');
    check((await sql("select not has_function_privilege('anon','public.s10_dashboard()','execute') and not has_function_privilege('authenticated','public.set_s10_role(uuid,text,text)','execute') and not has_table_privilege('authenticated','public.s10_roles','insert');", restored)).trim() === 't');
    check((await sql("select relrowsecurity from pg_class where oid='public.s10_roles'::regclass;", restored)).trim() === 't');
    check((await sql(`set request.jwt.claim.sub='${randomUUID()}';select public.s10_search('Synthetic');`, restored).then(() => false, () => true)) === true);
    check((await sql(`select public.s10_group('${o}');`, restored)).trim() === o);
    console.log(JSON.stringify({ checks, actual_postgres_overlap: true, optimistic_single_winner: true, backup_format: 'PGDMP custom', backup_sha256: createHash('sha256').update(archive).digest('hex'), schema_and_synthetic_data_restored: true, rls_grants_auth_functions_verified: true, private_user_data_copied: false, staging_restore_verified: false }));
}
finally {
    for (const db of created.reverse()) {
        assert.match(db, /^event_radar_s10_(test|restore)_[a-f0-9]{16}$/);
        await docker(['exec', container, 'dropdb', '-U', 'postgres', db]);
    }
    console.log(JSON.stringify({ own_databases_removed: created.length }));
}
