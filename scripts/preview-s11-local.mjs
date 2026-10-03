// Disposable browser QA account only. No user data copied and no Plus/admin grant.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const stateFile = '/private/tmp/event-radar-s11-preview.json';
const password = 'S11-Disposable-Test-Only!'; // Public synthetic credential; never reuse for a real account.
const { admin } = localClients({ timeoutMs: 10000 });
const action = process.argv[2];
if (process.argv.length !== 3 || !['create', 'status', 'cleanup'].includes(action)) throw Error('Usage: preview-s11-local.mjs create|status|cleanup');
if (action === 'create') {
 if (await readFile(stateFile).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw Error('Cleanup the previous own S11 QA account first');
 const email = 's11-browser-' + randomUUID() + '@example.test';
 const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa_fixture: 'S11 browser synthetic account' } });
 if (error) throw Error('Own local S11 QA account unavailable');
 try { await writeFile(stateFile, JSON.stringify({ id: data.user.id, email }), { mode: 0o600, flag: 'wx' }); }
 catch (error) { await admin.auth.admin.deleteUser(data.user.id); throw error; }
 console.log(JSON.stringify({ email, password: 'Use the public TEST ONLY password in this script; not a real credential.', local_only: true }));
} else {
 const state = JSON.parse(await readFile(stateFile, 'utf8'));
 if (!/^s11-browser-[a-f0-9-]{36}@example.test$/.test(state.email)) throw Error('Own S11 fixture required');
 const { data, error } = await admin.auth.admin.getUserById(state.id);
 if (error || data.user.email !== state.email || data.user.user_metadata.qa_fixture !== 'S11 browser synthetic account') throw Error('Own S11 fixture identity mismatch');
 if(action==='status'){
  const prefs=await admin.from('s11_preferences').select('metrics_enabled').eq('user_id',state.id).maybeSingle();
  const metrics=await admin.from('s11_metrics').select('day,kind,count').eq('user_id',state.id).order('kind');
  if(prefs.error||metrics.error)throw Error('Own S11 status unavailable');
  console.log(JSON.stringify({own_qa:true,metrics_enabled:prefs.data?.metrics_enabled??false,counters:metrics.data}));
 }else{
 const result = await admin.auth.admin.deleteUser(state.id); if (result.error) throw Error('Own S11 cleanup failed');
 await unlink(stateFile); console.log(JSON.stringify({ own_s11_browser_account_removed: true }));
 }
}
