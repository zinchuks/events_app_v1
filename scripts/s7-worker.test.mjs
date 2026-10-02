import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTicket, processS7Job, checkS7Receipts } from './lib/s7-worker.mjs';
const response = (status, data) => async () => ({ status, ok: status === 200, json: async () => ({ data }) });
test('S7 send ticket: accepted means Expo received, never device proof', async () => {
 assert.deepEqual(await sendTicket({}, response(200, [{ status: 'ok', id: 'fixture-ticket' }])), { result: 'accepted', ticket: 'fixture-ticket' });
});
test('S7 definite rate rejection may retry, invalid tokens stop', async () => {
 assert.equal((await sendTicket({}, response(429))).result, 'retry');
 for (const error of ['MessageRateExceeded', 'DeviceNotRegistered', 'InvalidCredentials']) {
  assert.deepEqual(await sendTicket({}, response(200, [{ status: 'error', details: { error } }])), { result: error === 'MessageRateExceeded' ? 'retry' : 'rejected', error });
 }
});
test('S7 timeout, 5xx or malformed accepted response retain uncertain dispatch', async () => {
 const cases = [async () => { throw Error('timeout'); }, response(503), response(200, []), response(200, [{ status: 'ok' }]), response(200, [{ status: 'ok', id: 'x'.repeat(201) }])];
 for (const send of cases) assert.equal((await sendTicket({}, send)).result, 'uncertain');
});
test('S7 payload stays short and single-device with bounded timeout', async () => {
 const payload = { to: 'fixture-token', title: 'Selection', body: 'Event Radar', data: { digest_id: 'fixture-id' } };
 await sendTicket(payload, async (url, options) => {
  assert.equal(url, 'https://exp.host/--/api/v2/push/send');
  assert.deepEqual(JSON.parse(options.body), [payload]);assert.ok(options.signal);
  return { status: 400, ok: false };
 });
});
function fixtureAdmin(beginStatus = 'dispatch', claimStatus = 'claimed', receipts = []) {
 const calls = [];
 return { calls, rpc(name, params) {
  calls.push({ name, params });
  const data = name === 'claim_s7_notification' ? { status: claimStatus, id: 'job', token: 'fence', digest_id: 'digest' }
   : name === 'begin_s7_delivery' ? { status: beginStatus, delivery_id: 'delivery', device_token: 'synthetic-token', locale: 'en', digest_id: 'digest' } : true;
  return { abortSignal: async () => ({ data, error: null }) };
 }, from(name) {
  const builder = { select: () => builder, eq: () => builder, order: () => builder, single: () => builder,
   lte: () => builder, limit: () => builder, range: () => builder,
   abortSignal: async () => ({ data: name === 'notification_jobs' ? { user_id: 'owner' } : name === 'device_tokens' ? [{ id: 'device' }] : receipts, error: null }) };
  return builder;
 } };
}
test('S7 synthetic transport never calls Expo, still obtains a fenced dispatch', async () => {
 const admin = fixtureAdmin();
 assert.equal(await processS7Job(admin, 'fixture', async () => { throw Error('Must not call network'); }), 'fixture_finished');
 assert.equal(admin.calls.find(c => c.name === 'finish_s7_delivery').params.result, 'fixture_recorded');
 assert.ok(admin.calls.some(c => c.name === 'begin_s7_delivery'));
});
test('S7 policy veto or lost lease never sends an external request', async () => {
 for (const status of ['quiet', 'rule_changed', 'already_attempted', 'lost_lease', 'device_removed']) {
  const admin = fixtureAdmin(status);let sends = 0;
  await processS7Job(admin, 'expo', async () => { sends++;throw Error('Forbidden'); });
  assert.equal(sends, 0);assert.ok(!admin.calls.some(c => c.name === 'finish_s7_delivery'));
 }
 const optedOut = fixtureAdmin('dispatch', 'opt_out');
 assert.equal(await processS7Job(optedOut, 'expo'), 'opt_out');assert.equal(optedOut.calls.length, 1);
});
test('S7 actual transport contract creates a short digest deep link and persists a ticket', async () => {
 const admin = fixtureAdmin();
 await processS7Job(admin, 'expo', async (_url, options) => {
  const [payload] = JSON.parse(options.body);
  assert.deepEqual(payload.data, { digest_id: 'digest' });assert.equal(payload.body, 'Event Radar');assert.equal(payload.title, 'Your event selection is ready');
  return { status: 200, ok: true, json: async () => ({ data: [{ status: 'ok', id: 'synthetic-ticket' }] }) };
 });
 assert.equal(admin.calls.find(c => c.name === 'finish_s7_delivery').params.ticket, 'synthetic-ticket');
});
test('S7 receipts missing/error cases query receipts without resending push', async () => {
 for (const data of [{}, { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } }]) {
  const admin = fixtureAdmin('dispatch', 'claimed', [{ id: 'delivery', receipt_id: 'ticket' }]);
  assert.equal(await checkS7Receipts(admin, async (url, options) => {
   assert.equal(url, 'https://exp.host/--/api/v2/push/getReceipts');assert.deepEqual(JSON.parse(options.body), { ids: ['ticket'] });
   return { ok: true, json: async () => ({ data }) };
  }), 1);
  const result = admin.calls.find(c => c.name === 'finish_s7_receipt').params;
  assert.equal(result.result, data.ticket ? 'error' : 'missing');
  if (data.ticket) assert.equal(result.error, 'DeviceNotRegistered');
  assert.ok(!admin.calls.some(c => c.name === 'begin_s7_delivery'));
 }
});
