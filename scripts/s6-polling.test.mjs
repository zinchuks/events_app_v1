// Explicit orchestration fakes: these do not prove live-source or production uptime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pollingOptions, pollS6Sources, watchS6Sources } from './lib/s6-polling.mjs';

function database(reply) {
 const calls = [];
 return { calls, admin: { rpc(name, params) {
  calls.push({ name, params });
  return { abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return Promise.resolve().then(() => reply(name, params, signal)); } };
 } } };
}
const extraction = async () => ({ batch: [{ external_id: 'unit-fixture' }], metrics: { inspected: 1 } });

test('automatic polling cannot bypass cadence/backoff or use an unbounded wake rate', () => {
 for (const args of [['--watch', '--force'], ['--watch', '--interval-seconds=1'], ['--watch', '--cycles=0'], ['--watch', '--cycles=' + '9'.repeat(400)], ['--cycles=2'], ['unreviewed-source']]) {
  assert.throws(() => pollingOptions(args));
 }
 assert.deepEqual(pollingOptions(['helsinki', 'helsinki', '--watch', '--cycles=2']).sources, ['helsinki']);
 assert.equal(pollingOptions(['madrid', '--force']).force, true);
});

test('not-due/leased sources do not fetch or import', async () => {
 const db = database(() => ({ data: null, error: null }));
 let fetches = 0;
 const result = await pollS6Sources({ admin: db.admin, extract: async () => { fetches++; }, report: () => {} });
 assert.equal(result.failures, 0); assert.equal(fetches, 0);
 assert.equal(db.calls.length, 3); assert.ok(db.calls.every(c => c.name === 'claim_s6_source' && !c.params.force_poll));
});

test('a claim failure does not skip another source and diagnostics omit error bodies/keys', async () => {
 const db = database((_name, params) => params.source_code === 'madrid'
  ? { error: { message: 'private diagnostic must not be logged' } } : { data: null, error: null });
 const messages = [];
 const result = await pollS6Sources({ admin: db.admin, report: value => messages.push(value) });
 assert.equal(result.failures, 1); assert.equal(db.calls.length, 3);
 assert.deepEqual(messages[0], { source: 'madrid', status: 'claim_failed' });
});

test('successful import uses its own claim and never marks failure', async () => {
 const db = database(name => ({ data: name === 'claim_s6_source' ? 'own-claim' : 1, error: null }));
 const result = await pollS6Sources({ admin: db.admin, sources: ['madrid'], extract: extraction, report: () => {} });
 assert.equal(result.failures, 0);
 assert.deepEqual(db.calls.map(c => c.name), ['claim_s6_source', 'ingest_s6_source']);
 assert.equal(db.calls[1].params.claim_token, 'own-claim');
});

test('fetch failure releases the matching claim into durable backoff and continues', async () => {
 const db = database(name => ({ data: name === 'claim_s6_source' ? 'own-claim' : 1, error: null }));
 const result = await pollS6Sources({ admin: db.admin, sources: ['madrid', 'helsinki'],
  extract: async source => { if (source === 'madrid') throw Error('private upstream text'); return extraction(); }, report: () => {} });
 assert.equal(result.failures, 1);
 assert.deepEqual(db.calls.find(c => c.name === 'fail_s6_source').params,
  { source_code: 'madrid', claim_token: 'own-claim', error_code: 'fetch_failed' });
 assert.ok(db.calls.some(c => c.name === 'ingest_s6_source' && c.params.source_code === 'helsinki'));
});

test('malformed extraction never reaches importer or marks source healthy', async () => {
 for (const extracted of [{ batch: null, metrics: {} }, 'truncated JSON']) {
  const db = database(() => ({ data: 'own-claim', error: null }));
  await pollS6Sources({ admin: db.admin, sources: ['madrid'], extract: async () => extracted, report: () => {} });
  assert.deepEqual(db.calls.map(c => c.name), ['claim_s6_source', 'fail_s6_source']);
  assert.equal(db.calls[1].params.error_code, 'normalize_failed');
 }
});

test('confirmed SQL rollback releases into backoff', async () => {
 const db = database(name => name === 'ingest_s6_source' ? { error: { code: '22023' } } : { data: 'own-claim', error: null });
 await pollS6Sources({ admin: db.admin, sources: ['madrid'], extract: extraction, report: () => {} });
 assert.equal(db.calls.at(-1).name, 'fail_s6_source');
 assert.equal(db.calls.at(-1).params.error_code, 'import_failed');
});

test('ambiguous import timeout/gateway response retains lease; no concurrent release or immediate retry', async () => {
 for (const code of ['', 'PGRST003']) {
  const db = database(name => name === 'ingest_s6_source' ? { error: { code } } : { data: 'own-claim', error: null });
  const messages = [];
  await pollS6Sources({ admin: db.admin, sources: ['madrid'], extract: extraction, report: value => messages.push(value) });
  assert.deepEqual(db.calls.map(c => c.name), ['claim_s6_source', 'ingest_s6_source']);
  assert.deepEqual(messages[0], { source: 'madrid', status: 'import_uncertain', lease_retained: true });
 }
});

test('shutdown during extraction releases claim and starts no further source', async () => {
 const controller = new AbortController();
 const db = database(() => ({ data: 'own-claim', error: null }));
 await pollS6Sources({ admin: db.admin, signal: controller.signal,
  extract: async () => { controller.abort(); return extraction(); }, report: () => {} });
 assert.deepEqual(db.calls.map(c => c.name), ['claim_s6_source', 'fail_s6_source']);
});

test('shutdown during an ambiguous import aborts request, retains claim and starts no further source', async () => {
 const controller = new AbortController(); const messages = [];
 const db = database((name, _params, signal) => {
  if (name === 'ingest_s6_source') {
   controller.abort(); assert.equal(signal.aborted, true); throw Error('request interrupted after possible commit');
  }
  return { data: 'own-claim', error: null };
 });
 await pollS6Sources({ admin: db.admin, signal: controller.signal, extract: extraction, report: value => messages.push(value) });
 assert.deepEqual(db.calls.map(c => c.name), ['claim_s6_source', 'ingest_s6_source']);
 assert.deepEqual(messages[0], { source: 'madrid', status: 'import_uncertain', lease_retained: true });
});

test('watch cycles are sequential and wait after completion; failures do not kill watcher', async () => {
 const order = []; let cycle = 0;
 const result = await watchS6Sources({ cycles: 3, poll: async () => {
  cycle++; order.push('poll-' + cycle); await Promise.resolve();
  if (cycle === 1) throw Error('private details');
  return { failures: cycle === 2 ? 1 : 0 };
 }, wait: async ms => { assert.equal(ms, 60000); order.push('wait'); }, report: () => {} });
 assert.deepEqual(order, ['poll-1', 'wait', 'poll-2', 'wait', 'poll-3']);
 assert.deepEqual(result, { cycles: 3, failures: 2, stopped: false });
});

test('watch shutdown interrupts sleep without another poll', async () => {
 const controller = new AbortController(); let count = 0;
 const result = await watchS6Sources({ signal: controller.signal, poll: async () => { count++; return { failures: 0 }; },
  wait: async () => { controller.abort(); throw Error('abort'); } });
 assert.equal(count, 1); assert.deepEqual(result, { cycles: 1, failures: 0, stopped: true });
});
