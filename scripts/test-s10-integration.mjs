// Actual local Auth/PostgREST; own accounts and empty unreviewed source only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const { admin, client } = localClients({ timeoutMs: 10000 });
const users = [];
const sources = [];
let checks = 0;
function ok(r) { assert.equal(r.error, null, r.error?.message); checks++; return r.data; }
function denied(r) { assert.ok(r.error); checks++; }
try {
    const a = client(), b = client(), anon = client();
    for (const c of [a, b]) {
        const email = 's10-' + randomUUID() + '@example.test', password = randomUUID() + 'Aa1!';
        const u = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'admin' } }));
        users.push(u.user.id);
        ok(await c.auth.signInWithPassword({ email, password }));
    }
    denied(await a.rpc('s10_dashboard'));
    denied(await anon.rpc('s10_dashboard'));
    denied(await a.from('s10_roles').upsert({ user_id: users[0], role: 'admin' }));
    denied(await a.rpc('set_s10_role', { selected_owner: users[0], assigned_role: 'admin', reason: 'Escalation denied' }));
    for (const table of ['s10_audit', 's10_provider_facts', 's10_merges'])
        denied(await a.from(table).select('*'));
    ok(await admin.rpc('set_s10_role', { selected_owner: users[0], assigned_role: 'viewer', reason: 'Disposable local API test role' }));
    assert.equal(ok(await a.rpc('s10_dashboard')).role, 'viewer');
    checks++;
    const document = { code: 'qa-' + randomUUID().slice(0, 8), name: 'TEST S10 temporary source', url: 'https://fixture.invalid/s10', acquisition: 'api', terms_status: 'unreviewed', rights_reference: 'https://fixture.invalid/rights', allow_cache: false, allow_translate: false, allow_images: false, poll_enabled: false, poll_interval_seconds: 86400, freshness_seconds: 172800, coverage_note: 'Explicit temporary QA source; no real events.' };
    denied(await a.rpc('s10_source', { document, reason: 'Viewer must not write' }));
    ok(await admin.rpc('set_s10_role', { selected_owner: users[0], assigned_role: 'admin', reason: 'Disposable local API test promotion' }));
    const source = ok(await a.rpc('s10_source', { document, reason: 'Own temporary API fixture' }));
    sources.push(source);
    denied(await b.rpc('s10_dashboard'));
    denied(await b.rpc('s10_source', { document, reason: 'Regular user must not write' }));
    ok(await a.rpc('s10_source', { document: { ...document, name: 'TEST S10 updated temporary source' }, selected_source: source, expected_revision: 1, reason: 'Own temporary API fixture update' }));
    denied(await a.rpc('s10_source', { document, selected_source: source, expected_revision: 1, reason: 'Stale edit must fail' }));
    denied(await a.from('sources').update({ poll_enabled: true }).eq('id', source));
    ok(await a.rpc('s10_delete_source', { selected_source: source, expected_revision: 2, reason: 'Cleanup own empty API fixture' }));
    sources.length = 0;
    ok(await admin.rpc('set_s10_role', { selected_owner: users[0], assigned_role: null, reason: 'Disposable API role revocation' }));
    denied(await a.rpc('s10_dashboard'));
    console.log(JSON.stringify({ checks, actual_auth_postgrest: true, signup_metadata_trusted: false, real_catalog_mutated: false, server_secrets_in_browser: false }));
}
finally {
    for (const id of sources) {
        await admin.from('source_poll_state').delete().eq('source_id', id);
        await admin.from('sources').delete().eq('id', id);
    }
    if (users.length)
        ok(await admin.from('s10_audit').delete().or('actor.in.(' + users.join(',') + '),target.in.(' + [...users, ...sources].join(',') + ')'));
    for (const id of users) {
        const r = await admin.auth.admin.deleteUser(id);
        if (r.error) {
            console.error('Own S10 fixture cleanup failed');
            process.exitCode = 1;
        }
    }
}
