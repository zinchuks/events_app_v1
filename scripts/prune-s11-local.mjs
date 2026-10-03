// Local-only retention maintenance, independent of ingestion/push/billing failures.
import { setTimeout as sleep } from 'node:timers/promises';
import { localClients } from './lib/local-clients.mjs';
const args = process.argv.slice(2);
if (args.some(v => v !== '--watch') || args.length > 1) throw Error('Usage: prune-s11-local.mjs [--watch]');
const { admin } = localClients({ timeoutMs: 10000 });
const abort = new AbortController();
process.on('SIGINT', () => abort.abort()); process.on('SIGTERM', () => abort.abort());
let lastDay = '';
do {
 const day = new Date().toISOString().slice(0, 10);
 if (day !== lastDay) {
  const { data, error } = await admin.rpc('prune_s11_metrics');
  if (error) { console.error('S11 retention unavailable'); if (!args.length) process.exitCode = 1; }
  else { lastDay = day; console.log(JSON.stringify({ retention_pruned: data, daily_maintenance: true })); }
 }
 if (!args.length) break;
 try { await sleep(60000, undefined, { signal: abort.signal }); } catch { break; }
} while (!abort.signal.aborted);
