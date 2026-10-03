// Genuine loopback API journey, own disposable accounts; no push/store/model calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const { admin, client } = localClients({ timeoutMs: 15000 });
const users = []; let checks = 0;
const ok = r => { assert.equal(r.error, null, r.error?.message); checks++; return r.data; };
const check = value => { assert.ok(value); checks++; };
const denied = r => { check(Boolean(r.error)); };
try {
 const a = client(), b = client(), anon = client();
 for (const c of [a, b]) {
  const email = 's11-' + randomUUID() + '@example.test', password = randomUUID() + 'Aa1!';
  const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  users.push(user.user.id); ok(await c.auth.signInWithPassword({ email, password }));
 }
 check(ok(await a.rpc('s11_metrics_enabled')) === false);
 check(ok(await a.rpc('record_s11_metric', { kind: 'rule_created' })) === false);
 check(ok(await a.from('s11_metrics').select('*')).length === 0);
 denied(await anon.rpc('record_s11_metric', { kind: 'rule_created' }));
 denied(await a.rpc('set_s11_metrics', { enabled: null }));
 denied(await a.rpc('record_s11_metric', { kind: 'private search text' }));
 denied(await a.from('s11_preferences').upsert({ user_id: users[0], metrics_enabled: true }));
 denied(await a.from('s11_metrics').insert({ user_id: users[0], day: '2026-10-03', kind: 'rule_created', count: 1 }));
 denied(await a.rpc('verify_s11_staging',{expected_host:'synthetic-stage.supabase.co'}));
 denied(await a.from('s11_runtime').select('*'));
 denied(await admin.rpc('verify_s11_staging',{expected_host:'synthetic-stage.supabase.co'}));
 denied(await a.rpc('prune_s11_metrics')); denied(await a.rpc('s11_metrics_report'));
 check(ok(await a.rpc('set_s11_metrics', { enabled: true })) === true);
 const city = ok(await anon.from('territories').select('id').eq('external_id', 'madrid:municipio:Madrid').single());
 const document = { name: 'TEST S11 own browser/API music rule', enabled: true, timezone: 'Europe/Madrid',
  filters: { scope: 's4', categories: ['music'], languages: [], include_unknown_language: true, include_unknown_price: true, include_unknown_age: true },
  event_horizon: { kind: 'days', days: 30 }, areas: [{ kind: 'city', territory_id: city.id, parameters: {} }] };
 const rule = ok(await a.rpc('save_s7_rule', { rule_document: document, delivery_preferences: { mode: 'manual', time: '18:00', active: false } }));
 ok(await a.rpc('record_s11_metric', { kind: 'rule_created' }));
 const plan = ok(await a.rpc('s9_state')); check(plan.tier === 'free' && plan.limit === 1 && plan.active_rules.includes(rule));
 const feed = ok(await a.rpc('list_s5_events', { view_mode: 'matches' }));
 check(feed.total > 0 && feed.items.length <= 30 && feed.items.every(x => x.category_code === 'music'));
 check(new Set(feed.items.map(x => x.id)).size === feed.items.length);
 check(ok(await b.rpc('list_s5_events', { view_mode: 'matches' })).total === 0);
 const catalog = ok(await anon.rpc('list_s5_events')); check(catalog.total >= feed.total);
 const search = ok(await a.rpc('list_s5_events', { search_text: feed.items[0].title })); check(search.total > 0);
 const digest = ok(await a.rpc('build_rule_digest')); check(Boolean(digest));
 const ownDigest = ok(await a.from('digests').select('id').eq('id', digest)); check(ownDigest.length === 1);
 check(ok(await b.from('digests').select('id').eq('id', digest)).length === 0);
 check(ok(await b.from('digest_items').select('occurrence_id').eq('digest_id', digest)).length === 0);
 const snapshots=ok(await a.from('digest_items').select('matched_rule_names,selection_snapshot').eq('digest_id',digest));
 check(snapshots.length>0&&snapshots.every(item=>item.matched_rule_names.includes(document.name)&&typeof item.selection_snapshot.title==='string'));
 ok(await a.rpc('record_s11_metric', { kind: 'digest_opened' }));
 const occurrence = feed.items[0].id;
 ok(await a.from('saved_events').upsert({ user_id: users[0], occurrence_id: occurrence }));
 ok(await a.rpc('record_s11_metric', { kind: 'event_saved' }));
 check(ok(await b.from('saved_events').select('*').eq('user_id', users[0])).length === 0);
 ok(await a.rpc('set_s8_saved_preferences', { selected_occurrence: occurrence, leads: [], updates: true, zone: 'Europe/Madrid', quiet: null }));
 check(ok(await a.from('saved_events').select('occurrence_id').eq('occurrence_id', occurrence)).length === 1);
 for (const locale of ['en', 'es', 'uk']) ok(await a.from('profiles').update({ locale }).eq('id', users[0]));
 const metrics = ok(await a.from('s11_metrics').select('*')); check(metrics.length === 3 && metrics.every(row => row.count === 1));
 check(ok(await b.from('s11_metrics').select('*').eq('user_id', users[0])).length === 0);
 denied(await b.rpc('set_s11_metrics', { enabled: false, user_id: users[0] }));
 ok(await a.rpc('set_s11_metrics', { enabled: false }));
 check(ok(await a.from('s11_metrics').select('*')).length === 0);
 check(ok(await a.rpc('record_s11_metric', { kind: 'event_saved' })) === false);
 const session = ok(await a.auth.getSession()).session;
 const restored = client();
 ok(await restored.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }));
 check(ok(await restored.auth.getUser()).user.id === users[0]);
 check(ok(await a.from('saved_events').select('*')).length === 1);
 ok(await a.rpc('set_s11_metrics', { enabled: true }));
 ok(await a.rpc('record_s11_metric', { kind: 'digest_opened' }));
 ok(await a.rpc('delete_my_account')); users[0] = null;
 ok(await a.auth.signOut({ scope: 'local' }));
 check(ok(await a.auth.getSession()).session === null);
 check(ok(await admin.from('s11_metrics').select('*').eq('user_id', session.user.id)).length === 0);
 check(ok(await admin.from('s11_preferences').select('*').eq('user_id', session.user.id)).length === 0);
 check(ok(await admin.from('rules').select('id').eq('id', rule)).length === 0);
 check(ok(await admin.from('digests').select('id').eq('id', digest)).length === 0);
 check(ok(await anon.from('occurrences').select('id').eq('id', occurrence)).length === 1);
 console.log(JSON.stringify({ checks, actual_auth_api_journey: true, real_catalog_read: true, real_catalog_mutated: false, opt_in_rls_deletion: true, native_push_purchase_verified: false }));
} finally {
 for (const id of users.filter(Boolean)) {
  const r = await admin.auth.admin.deleteUser(id);
  if (r.error) { process.exitCode = 1; console.error('Own S11 account cleanup failed'); }
 }
 console.log(JSON.stringify({ own_test_accounts_removed: true }));
}
