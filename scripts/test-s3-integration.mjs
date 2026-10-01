// Real local DB/Auth/RLS + one imported Madrid event. Own disposable users only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
import { processS3Job } from './lib/s3-transport.mjs';
const { admin, client } = localClients(); const a = client(), b = client(), anon = client();
const users = []; const password = randomUUID() + '!aA1'; let checks = 0;
function ok(r) { assert.equal(r.error, null, r.error?.message); checks++; return r.data; }
function denied(r) { assert.ok(r.error); checks++; }
async function makeUser(c) { const email = 's3-' + randomUUID() + '@example.test'; const u = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })); users.push(u.user.id); ok(await c.auth.signInWithPassword({ email, password })); return u.user.id; }
try {
 const uid = await makeUser(a); await makeUser(b);
 const catalog = ok(await anon.rpc('list_s3_events', { category_codes: [], page_offset: 0 }));
 assert.ok(catalog.length > 0, 'Import live Madrid feed before this test'); checks++;
 const event = catalog[0]; assert.ok(event.category_code); checks++;
 const e = ok(await anon.from('events').select('is_demo,primary_source_id,territory_id').eq('id', event.event_id).single()); assert.equal(e.is_demo, false); checks++;
 const provenance = ok(await anon.from('event_sources').select('canonical_url,checked_at').eq('occurrence_id', event.id)); assert.ok(provenance.length && provenance[0].canonical_url.includes('madrid.es')); checks++;
 const categoryEvents = ok(await anon.rpc('list_s3_events', { category_codes: [event.category_code] })); assert.ok(categoryEvents.every(e => e.category_code === event.category_code)); checks++;
 denied(await anon.rpc('save_s3_rule', { category_codes: [] }));
 denied(await a.rpc('save_s3_rule', { category_codes: ['made-up'] }));
 const rule = ok(await a.rpc('save_s3_rule', { category_codes: [event.category_code] }));
 assert.equal(ok(await a.rpc('save_s3_rule', { category_codes: [event.category_code, event.category_code] })), rule); checks++;
 const areas = ok(await a.from('rule_areas').select('territory_id').eq('rule_id', rule)); assert.equal(areas.length, 1); assert.equal(areas[0].territory_id, e.territory_id); checks += 2;
 denied(await b.rpc('build_s3_digest', { selected_rule: rule }));
 const [d1, d2] = await Promise.all([a.rpc('build_s3_digest', { selected_rule: rule }), a.rpc('build_s3_digest', { selected_rule: rule })]);
 const digest = ok(d1); assert.ok(digest); assert.equal(digest, ok(d2)); checks += 2;
 const items = ok(await a.from('digest_items').select('occurrence_id,occurrences(events(category_code,territory_id,is_demo))').eq('digest_id', digest));
 assert.ok(items.some(i => i.occurrence_id === event.id)); assert.ok(items.every(i => i.occurrences.events.category_code === event.category_code && i.occurrences.events.territory_id === e.territory_id && !i.occurrences.events.is_demo)); checks += 2;
 assert.equal(ok(await b.from('digests').select('id').eq('id', digest)).length, 0); assert.equal(ok(await b.from('digest_items').select('occurrence_id').eq('digest_id', digest)).length, 0); checks += 2;
 denied(await a.from('digests').insert({ user_id: uid, business_key: 'forged' }));
 denied(await a.from('digest_items').insert({ user_id: uid, digest_id: digest, occurrence_id: event.id }));
 const job = ok(await a.from('notification_jobs').select('*').eq('digest_id', digest).single()); assert.equal(job.transport, 'fixture'); checks++;
 denied(await a.rpc('claim_s3_notification', { job_transport: 'fixture', selected_job: job.id }));
 denied(await a.rpc('ingest_madrid', { batch: [], fetched_at: new Date().toISOString() }));
 let sends = 0;
 const transport = await processS3Job(admin, 'fixture', () => { sends++; throw Error('Fixture must never contact a transport'); }, job.id);
 assert.equal(transport.status, 'fixture_recorded'); assert.equal(sends, 0); checks += 2;
 assert.equal(await processS3Job(admin, 'fixture', fetch, job.id), null); checks++;
 const deliveries = ok(await a.from('deliveries').select('status,receipt_id').eq('job_id', job.id)); assert.equal(deliveries.length, 1); assert.equal(deliveries[0].status, 'fixture_recorded'); assert.equal(deliveries[0].receipt_id, null); checks += 3;
 assert.equal(ok(await b.from('deliveries').select('id').eq('job_id', job.id)).length, 0); checks++;
 ok(await admin.from('notification_jobs').update({ status: 'claimed', lease_until: '2020-01-01T00:00:00Z' }).eq('id', job.id));
 assert.equal((await processS3Job(admin, 'fixture', fetch, job.id)).status, 'fixture_recorded'); checks++;
 assert.equal(ok(await a.from('deliveries').select('id').eq('job_id', job.id)).length, 1); checks++;
 const fakeToken = 'ExpoPushToken[s3_fixture_' + randomUUID().replaceAll('-', '') + ']';
 ok(await a.rpc('register_push_device', { expo_token: fakeToken, device_platform: 'ios' }));
 ok(await b.rpc('register_push_device', { expo_token: fakeToken, device_platform: 'android' }));
 assert.equal(ok(await a.from('device_tokens').select('id').eq('token', fakeToken)).length, 0); checks++;
 assert.equal(ok(await b.from('device_tokens').select('id').eq('token', fakeToken)).length, 1); checks++;
 ok(await a.from('profiles').update({ push_enabled: false }).eq('id', uid));
 ok(await a.from('saved_events').upsert({ user_id: uid, occurrence_id: event.id })); ok(await a.from('saved_events').upsert({ user_id: uid, occurrence_id: event.id }));
 assert.equal(ok(await a.from('saved_events').select('occurrence_id').eq('occurrence_id', event.id)).length, 1); assert.equal(ok(await b.from('saved_events').select('occurrence_id').eq('user_id', uid)).length, 0); checks += 2;
 const fresh = client(); const refreshed = ok(await fresh.auth.signInWithPassword({ email: (await a.auth.getUser()).data.user.email, password })); assert.ok(refreshed.session); checks++;
 assert.equal(ok(await fresh.from('digests').select('id').eq('id', digest)).length, 1); checks++;
 ok(await fresh.auth.signOut({ scope: 'local' }));
 ok(await a.from('saved_events').delete().eq('user_id', uid).eq('occurrence_id', event.id)); assert.equal(ok(await a.from('saved_events').select('occurrence_id').eq('occurrence_id', event.id)).length, 0); checks++;
 ok(await a.from('rules').update({ enabled: false }).eq('id', rule)); denied(await a.rpc('build_s3_digest', { selected_rule: rule }));
 ok(await a.rpc('save_s3_rule', { category_codes: [event.category_code] }));
 ok(await a.from('rules').update({ event_horizon: { days: 999 } }).eq('id', rule)); denied(await a.rpc('build_s3_digest', { selected_rule: rule }));
 denied(await a.rpc('register_push_device', { expo_token: 'fake', device_platform: 'ios' }));
 // Atomic rollback: first valid fixture row, then an invalid source URL.
 const externalId = 'rollback-' + randomUUID();
 const record = { external_id: externalId, hash: 'a'.repeat(64), title: 'Disposable rollback probe', url: 'https://www.madrid.es/rollback-test', category_code: 'other', locality: 'MADRID', occurrence: { external_id: externalId, timezone: 'Europe/Madrid', time_kind: 'date_only', local_date: '2026-12-01' } };
 denied(await admin.rpc('ingest_madrid', { batch: [record, { ...record, url: 'https://example.test/forbidden' }], fetched_at: new Date().toISOString() }));
 assert.equal(ok(await admin.from('source_records').select('id').eq('external_id', externalId)).length, 0); checks++;
 assert.equal(ok(await admin.from('events').select('id').eq('canonical_url', record.url)).length, 0); checks++;
 console.log(JSON.stringify({ checks, real_source: 'Ayuntamiento de Madrid', real_occurrence: event.id, fixture_transport: 'DB only; sends=0', push_delivery: 'blocked: browser-only' }));
} finally {
 for (const id of users) { const r = await admin.auth.admin.deleteUser(id); if (r.error) { console.error('Own fixture cleanup failed'); process.exitCode = 1; } }
}
