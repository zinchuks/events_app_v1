// Real local Auth/PostgREST/RLS; disposable test users only. Never reset the database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const { admin, client } = localClients(); const a = client(); const b = client(); const anon = client();
const users = []; const password = randomUUID() + '!Aa1'; let checks = 0;
function ok(r) { assert.equal(r.error, null, r.error?.message); checks++; return r.data; }
function denied(r) { assert.ok(r.error); checks++; }
function check(v) { assert.ok(v); checks++; }
try {
 for (const c of [a, b]) {
  const email = 's7-' + randomUUID() + '@example.test';
  const d = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));users.push(d.user.id);
  ok(await c.auth.signInWithPassword({ email, password }));
 }
 const city = ok(await anon.from('territories').select('id').eq('external_id', 'madrid:municipio:Madrid').single());
 const doc = { name: 'Disposable S7 rule', enabled: true, timezone: 'Europe/Madrid',
  filters: { scope: 's4', categories: ['music'], languages: [], include_unknown_language: true, include_unknown_price: true, include_unknown_age: true },
  event_horizon: { kind: 'days', days: 30 }, areas: [{ kind: 'city', territory_id: city.id, parameters: {} }] };
 const prefs = { mode: 'daily', active: true, time: '18:00', quiet: { start: '22:00', end: '08:00' }, repeat_unchanged: false };
 denied(await anon.rpc('save_s7_rule', { rule_document: doc, delivery_preferences: prefs }));
 const id = ok(await a.rpc('save_s7_rule', { rule_document: doc, delivery_preferences: prefs }));
 let row = ok(await a.from('rules').select('*').eq('id', id).single());
 check(row.delivery_schedule.active && new Date(row.next_run_at) > new Date());check(row.schedule_revision > 0);
 denied(await b.rpc('set_s7_delivery_preferences', { selected_rule: id, delivery_preferences: prefs, rule_timezone: 'UTC' }));
 for (const c of [a, anon]) for (const name of ['run_s7_scheduler', 'claim_s7_notification']) denied(await c.rpc(name));
 denied(await a.rpc('s7_matches', { selected_owner: users[1], selected_rules: null, matching_clock: new Date().toISOString() }));
 check(ok(await b.from('rules').select('id').eq('id', id)).length === 0);
 check(ok(await b.from('s7_runs').select('id').eq('user_id', users[0])).length === 0);
 denied(await a.from('s7_seen').select('*'));denied(await a.from('s7_runs').insert({ user_id: users[0], business_key: 'forged', scheduled_at: new Date().toISOString(), rule_snapshot: [], outcome: 'ready' }));
 denied(await a.from('rules').update({ next_run_at: new Date().toISOString(), schedule_revision: 0 }).eq('id', id).select().single());
 for (const invalid of [
  { ...prefs, active: 'true' }, { ...prefs, repeat_unchanged: 'true' }, { mode: 'manual', active: true },
  { ...prefs, quiet: { start: '22:00', end: '22:00' } }, { ...prefs, quiet: { start: '22:00', end: '24:00' } },
  { ...prefs, quiet: { start: '22:00' } }, { mode: 'weekdays', active: true, time: '18:00', weekdays: [1, 1] },
 ]) denied(await a.rpc('save_s7_rule', { rule_document: doc, delivery_preferences: invalid }));
 check(ok(await a.from('rules').select('id').eq('user_id', users[0])).length === 1);
 ok(await a.rpc('set_s7_delivery_preferences', { selected_rule: id, delivery_preferences: { mode: 'weekdays', active: true, time: '10:00', weekdays: [1, 5] }, rule_timezone: 'America/Toronto' }));
 row = ok(await a.from('rules').select('*').eq('id', id).single());
 check(row.timezone === 'America/Toronto' && row.next_run_at && row.schedule_revision > 1);
 ok(await a.rpc('set_s4_rule_enabled', { selected_rule: id, rule_enabled: false }));
 check(ok(await a.from('rules').select('next_run_at').eq('id', id).single()).next_run_at === null);
 ok(await a.rpc('set_s4_rule_enabled', { selected_rule: id, rule_enabled: true }));
 check(Boolean(ok(await a.from('rules').select('next_run_at').eq('id', id).single()).next_run_at));
 ok(await a.rpc('set_s7_delivery_preferences', { selected_rule: id, delivery_preferences: { mode: 'manual', active: false }, rule_timezone: 'UTC' }));
 check(ok(await a.from('rules').select('next_run_at').eq('id', id).single()).next_run_at === null);
 // New horizons run through the existing owner matching contract, with live rows.
 for (const horizon of [{ kind: 'months', months: 1 }, { kind: 'weekend' }, { kind: 'range', start: new Date().toISOString().slice(0, 10), end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }]) {
  ok(await a.rpc('save_s4_rule', { rule_document: { ...doc, event_horizon: horizon }, selected_rule: id }));
  const results = ok(await a.rpc('list_s5_events', { view_mode: 'matches', page_size: 1000 }));
  check(results.total > 0 && results.items.every(i => i.matched_rules.length === 1));
 }
 for (const horizon of [{ kind: 'months', months: 13 }, { kind: 'months', months: 1.5 }, { kind: 'range', start: '2026-02-30', end: '2026-03-01' }]) denied(await a.rpc('save_s4_rule', { rule_document: { ...doc, event_horizon: horizon }, selected_rule: id }));
 console.log(JSON.stringify({ checks, integration: 'actual local Auth/PostgREST/RLS/live Madrid matching', expo_requests: 0, device_delivery_verified: false }));
} finally {
 for (const id of users) {
  const result = await admin.auth.admin.deleteUser(id);
  if (result.error) { console.error('Own S7 fixture cleanup failed');process.exitCode = 1; }
 }
}
