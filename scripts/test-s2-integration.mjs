// Real local Supabase HTTP/Auth/RLS test. Never run against a hosted project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const url = status.API_URL;
assert.equal(url, 'http://127.0.0.1:54321', 'Integration test is restricted to the local stack');
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll('-', '');
const password = randomUUID() + '!aA1';
const ids = [];
let sourceId, eventId;
let checks = 0;
function ok(response) { assert.equal(response.error, null, response.error?.code ?? 'unexpected API failure'); checks++; return response.data; }
function denied(response) { assert.ok(response.error, 'write should be denied'); checks++; }
function client(storage) {
  return createClient(url, status.ANON_KEY, { auth: {
    persistSession: Boolean(storage), autoRefreshToken: false, detectSessionInUrl: false,
    storageKey: 'integration-auth', storage
  } });
}
async function mailCode(email, subject = 'confirm email') {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await fetch('http://127.0.0.1:54324/api/v1/search?query=' + encodeURIComponent('to:' + email + ' subject:"' + subject + '"'), { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    if (list.messages?.length) {
      const newest = list.messages[0];
      const message = await fetch('http://127.0.0.1:54324/api/v1/message/' + newest.ID, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
      const match = (message.HTML ?? message.Text ?? '').match(/\b\d{6}\b/);
      if (match) return match[0];
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Local capture mailbox did not receive an OTP');
}
try {
  const aEmail = 's2-a-' + runId + '@example.test';
  const bEmail = 's2-b-' + runId + '@example.test';
  const a = client(), b = client();
  const weak = await client().auth.signUp({ email: 's2-weak-' + runId + '@example.test', password: 'short1234' });
  if (weak.data.user) ids.push(weak.data.user.id);
  denied(weak);
  assert.equal(weak.error.code, 'weak_password', 'Must fail password policy, not rate limiting or mail delivery');
  // Actual signup, captured email and confirmation, not admin-created user.
  const signup = ok(await a.auth.signUp({ email: aEmail, password, options: { data: { locale: 'es' } } }));
  assert.equal(signup.session, null);
  ids.push(signup.user.id);
  ok(await a.auth.verifyOtp({ email: aEmail, token: await mailCode(aEmail), type: 'signup' }));
  const aId = signup.user.id;
  const bUser = ok(await admin.auth.admin.createUser({ email: bEmail, password, email_confirm: true }));
  ids.push(bUser.user.id);
  const bId = bUser.user.id;
  ok(await b.auth.signInWithPassword({ email: bEmail, password }));
  const profile = ok(await a.from('profiles').select('*').single());
  assert.equal(profile.id, aId);
  assert.equal(profile.locale, 'es'); assert.equal(profile.translation_locale, 'es');
  assert.equal(ok(await b.from('profiles').select('*').eq('id', aId)).length, 0);
  ok(await a.from('profiles').update({ locale: 'es', translation_locale: 'en', notification_timezone: 'Europe/Madrid' }).eq('id', aId));
  assert.equal(ok(await a.from('profiles').select('locale').single()).locale, 'es');
  assert.equal(ok(await b.from('profiles').update({ locale: 'en' }).eq('id', aId).select()).length, 0);
  denied(await a.from('profiles').update({ id: bId }).eq('id', aId));
  denied(await a.from('profiles').update({ notification_timezone: 'Invented/Zone' }).eq('id', aId));

  const source = ok(await admin.from('sources').insert({ name: 'S2 integration fixture', url: 'https://example.test/fixture', acquisition: 'fixture', terms_status: 'fixture', is_demo: true }).select().single());
  sourceId = source.id;
  const event = ok(await admin.from('events').insert({ primary_source_id: sourceId, canonical_url: 'https://example.test/event', checked_at: new Date().toISOString(), title: 'Synthetic S2 event; never a live source', is_demo: true }).select().single());
  eventId = event.id;
  const occurrence = ok(await admin.from('occurrences').insert({ event_id: eventId, external_id: runId, time_kind: 'date_only', local_date: '2026-10-02' }).select().single());
  assert.equal(occurrence.start_at, null);
  denied(await admin.from('occurrences').insert({ event_id: eventId, external_id: runId + '-invalid', time_kind: 'date_only', local_date: '2026-10-02', start_at: '2026-10-02T00:00:00Z' }));
  denied(await admin.from('occurrences').insert({ event_id: eventId, external_id: runId + '-zone', time_kind: 'known', start_at: '2026-10-02T10:00:00Z', timezone: 'Invented/Zone' }));
  ok(await a.from('saved_events').insert({ user_id: aId, occurrence_id: occurrence.id }));
  denied(await b.from('saved_events').insert({ user_id: aId, occurrence_id: occurrence.id }));
  const rule = ok(await a.from('rules').insert({ user_id: aId, name: 'S2 owner fixture' }).select().single());
  ok(await a.from('rule_areas').insert({ user_id: aId, rule_id: rule.id, kind: 'city', parameters: {} }));
  denied(await b.from('rule_areas').insert({ user_id: bId, rule_id: rule.id, kind: 'city', parameters: {} }));
  ok(await a.from('device_tokens').insert({ user_id: aId, platform: 'ios', token: 'S2Fixture-' + runId }));
  const digest = ok(await admin.from('digests').insert({ user_id: aId, business_key: runId }).select().single());
  ok(await admin.from('digest_items').insert({ user_id: aId, digest_id: digest.id, occurrence_id: occurrence.id }));
  const job = ok(await admin.from('notification_jobs').insert({ user_id: aId, business_key: runId, run_at: new Date().toISOString() }).select().single());
  ok(await admin.from('deliveries').insert({ user_id: aId, job_id: job.id, status: 'fixture' }));
  ok(await admin.from('entitlements').insert({ user_id: aId, tier: 'free' }));
  const writable = ['rules','rule_areas','saved_events','device_tokens'];
  const privateTables = [...writable, 'digests','digest_items','notification_jobs','deliveries','entitlements'];
  for (const table of privateTables) {
    assert.equal(ok(await a.from(table).select('*').eq('user_id', aId)).length, 1);
    assert.equal(ok(await b.from(table).select('*').eq('user_id', aId)).length, 0);
    if (writable.includes(table)) {
      if(table==='rules') {
        // S9 protects ownership at column ACL too; still exercise RLS with a writable field.
        denied(await b.from(table).update({ user_id: bId }).eq('user_id', aId));
        assert.equal(ok(await b.from(table).update({ name: 'Unauthorized' }).eq('user_id', aId).select()).length, 0);
      } else assert.equal(ok(await b.from(table).update({ user_id: bId }).eq('user_id', aId).select()).length, 0);
      denied(await a.from(table).update({ user_id: bId }).eq('user_id', aId));
    }
    const removal = await b.from(table).delete().eq('user_id', aId).select();
    if (writable.includes(table)) assert.equal(ok(removal).length, 0);
    else denied(removal);
    assert.equal(ok(await a.from(table).select('*').eq('user_id', aId)).length, 1);
  }
  denied(await a.from('entitlements').update({ tier: 'plus' }).eq('user_id', aId));
  denied(await anonymous.from('profiles').select('*'));
  denied(await anonymous.from('rules').select('*'));
  denied(await a.from('source_records').select('*'));
  denied(await a.from('events').update({ title: 'unauthorized' }).eq('id', eventId));
  assert.equal(ok(await anonymous.from('events').select('*').eq('id', eventId)).length, 1);
  const territories = ok(await anonymous.from('territories').select('*').eq('is_demo', true));
  assert.equal(territories.length, 4); assert.ok(territories.every(t => t.is_demo && t.provenance));
  assert.equal(ok(await anonymous.from('categories').select('*')).length, 11);
  denied(await anonymous.rpc('delete_my_account'));

  // Session persistence through a new SDK instance, then logout and reload.
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => { values.set(key,value); }, removeItem: key => { values.delete(key); } };
  const persisted = client(storage);
  ok(await persisted.auth.signInWithPassword({ email: aEmail, password }));
  const restored = client(storage);
  assert.equal(ok(await restored.auth.getUser()).user.id, aId);
  ok(await restored.auth.signOut());
  assert.equal(ok(await client(storage).auth.getSession()).session, null);
  denied(await a.auth.refreshSession()); // Global logout invalidates the old refresh token.
  ok(await a.auth.signInWithPassword({ email: aEmail, password }));
  ok(await a.auth.resetPasswordForEmail(aEmail));
  ok(await a.auth.verifyOtp({ email: aEmail, token: await mailCode(aEmail, 'reset password'), type: 'recovery' }));
  const newPassword = randomUUID() + '!bB2';
  ok(await a.auth.updateUser({ password: newPassword }));
  denied(await client().auth.signInWithPassword({ email: aEmail, password }));
  ok(await a.auth.signInWithPassword({ email: aEmail, password: newPassword }));

  // Caller cannot specify another user's ID. Own deletion cascades private rows only.
  denied(await b.rpc('delete_my_account', { user_id: aId }));
  ok(await a.rpc('delete_my_account'));
  for (const table of privateTables) assert.equal(ok(await admin.from(table).select('*').eq('user_id', aId)).length, 0);
  assert.equal(ok(await admin.from('profiles').select('*').eq('id', aId)).length, 0);
  assert.equal(ok(await admin.from('profiles').select('*').eq('id', bId)).length, 1);
  assert.equal(ok(await anonymous.from('events').select('*').eq('id', eventId)).length, 1);
  denied(await a.auth.refreshSession());
  denied(await client().auth.signInWithPassword({ email: aEmail, password: newPassword }));
  console.log(JSON.stringify({ status: 'pass', checks, integration: 'real local Auth/PostgREST/Postgres/PostGIS/Mailpit', nativeStorage: 'unverified', scenarios: ['email signup/confirmation','profile settings','cross-user read/write protection','server-only data and entitlements','date-only and timezone invariants','session restore/logout','email recovery/password change','own account deletion/private cascade/public preservation','demo territory/category seeds'] }));
} finally {
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  if (eventId) await admin.from('events').delete().eq('id', eventId);
  if (sourceId) await admin.from('sources').delete().eq('id', sourceId);
}
