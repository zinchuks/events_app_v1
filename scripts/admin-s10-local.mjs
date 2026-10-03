// Trusted local operator. No role-management API is exposed to the admin browser.
import assert from 'node:assert/strict';
import { localClients } from './lib/local-clients.mjs';
const [command, email, assigned, reason, ...extra] = process.argv.slice(2);
assert.ok(['grant', 'revoke'].includes(command) && email && reason && !extra.length, 'Usage: admin-s10-local.mjs grant EMAIL viewer|editor|admin REASON | revoke EMAIL none REASON');
assert.ok(command === 'grant' ? ['viewer', 'editor', 'admin'].includes(assigned) : assigned === 'none');
assert.ok(reason.trim().length >= 5 && reason.length <= 500);
const { admin } = localClients({ timeoutMs: 10000 });
let owner;
for (let page = 1; page <= 100; page++) {
    const r = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (r.error)
        throw Error('Local users unavailable');
    owner = r.data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (owner || r.data.users.length < 100)
        break;
}
assert.ok(owner, 'Existing local account required; no account was created');
const r = await admin.rpc('set_s10_role', { selected_owner: owner.id, assigned_role: command === 'grant' ? assigned : null, reason });
if (r.error)
    throw Error('Audited local role assignment failed');
console.log(JSON.stringify({ local: true, role: command === 'grant' ? assigned : null, audited: true, remote_modified: false }));
