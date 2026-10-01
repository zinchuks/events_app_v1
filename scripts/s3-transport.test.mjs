// Transport contract unit tests with explicit fakes; not Expo delivery evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processS3Job } from './lib/s3-transport.mjs';
function database({ enabled = true } = {}) {
 const job = { id: 'job', user_id: 'owner', digest_id: 'digest', status: 'pending' }; const writes = [];
 return { job, writes, admin: {
  rpc: async () => ({ data: job.status === 'pending' ? (job.status = 'claimed', [job]) : [], error: null }),
  from(table) {
   const builder = { select() { return builder; }, eq() { return builder; }, single() { return Promise.resolve({ data: { push_enabled: enabled, locale: 'uk' }, error: null }); },
    update(value) { writes.push({ table, action: 'update', value }); if (table === 'notification_jobs') Object.assign(job, value); return builder; },
    insert(value) { writes.push({ table, action: 'insert', value }); return builder; },
    delete() { writes.push({ table, action: 'delete' }); return builder; },
    then(resolve, reject) { return Promise.resolve({ data: [{ id: 'device', token: 'ExpoPushToken[unit_fake_token]' }], error: null }).then(resolve, reject); }
   }; return builder;
  }
 } };
}
test('Expo ticket acceptance is recorded without claiming device delivery', async () => {
 const db = database(); let body;
 const send = async (url, options) => { assert.equal(url, 'https://exp.host/--/api/v2/push/send'); body = JSON.parse(options.body); return { ok: true, json: async () => ({ data: [{ status: 'ok', id: 'ticket' }] }) }; };
 const result = await processS3Job(db.admin, 'expo', send);
 assert.equal(result.status, 'processed_not_delivery_proof'); assert.equal(body[0].data.digest_id, 'digest');
 assert.equal(db.writes.find(w => w.table === 'deliveries').value.status, 'accepted');
});
test('Opt-out prevents network transmission of pending Expo jobs', async () => {
 const db = database({ enabled: false }); let sent = 0;
 await processS3Job(db.admin, 'expo', async () => { sent++; });
 assert.equal(sent, 0); assert.equal(db.writes.find(w => w.table === 'deliveries').value.status, 'skipped_opt_out');
});
test('Ambiguous network failure is failed and is not automatically resent', async () => {
 const db = database(); let sent = 0;
 await assert.rejects(processS3Job(db.admin, 'expo', async () => { sent++; throw Error('timeout'); }));
 assert.equal(db.job.status, 'failed'); assert.equal(await processS3Job(db.admin, 'expo', async () => { sent++; }), null); assert.equal(sent, 1);
});
test('DeviceNotRegistered removes its binding and records rejection', async () => {
 const db = database();
 await processS3Job(db.admin, 'expo', async () => ({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) }));
 assert.equal(db.writes.find(w => w.table === 'deliveries').value.status, 'rejected');
 assert.ok(db.writes.some(w => w.table === 'device_tokens' && w.action === 'delete'));
});
