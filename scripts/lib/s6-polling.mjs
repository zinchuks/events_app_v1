// Local ingestion orchestration. No AI, push, or notification schedules.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

export const S6_SOURCES = ['madrid', 'toronto', 'helsinki'];
const execute = promisify(execFile);

export function pollingOptions(args) {
 const options = { sources: [], force: false, watch: false, intervalSeconds: 60, cycles: Infinity };
 for (const arg of args) {
  if (S6_SOURCES.includes(arg)) options.sources.push(arg);
  else if (arg === '--force') options.force = true;
  else if (arg === '--watch') options.watch = true;
  else if (/^--interval-seconds=\d+$/.test(arg)) options.intervalSeconds = Number(arg.split('=')[1]);
  else if (/^--cycles=\d+$/.test(arg)) options.cycles = Number(arg.split('=')[1]);
  else throw Error('Usage: ingest-s6-local.mjs [madrid|toronto|helsinki] [--force | --watch [--interval-seconds=60..3600] [--cycles=1..1000]]');
 }
 if (options.watch && options.force) throw Error('Watch mode cannot force polls or bypass cadence/backoff');
 if (options.intervalSeconds < 60 || options.intervalSeconds > 3600) throw Error('Polling wake interval must be 60..3600 seconds');
 if (args.some(arg => arg.startsWith('--cycles=')) && (!Number.isSafeInteger(options.cycles) || options.cycles < 1 || options.cycles > 1000)) throw Error('Cycle limit must be 1..1000');
 if (!options.watch && args.some(arg => arg.startsWith('--interval-seconds=') || arg.startsWith('--cycles='))) throw Error('Wake interval/cycle limit require --watch');
 options.sources = options.sources.length ? [...new Set(options.sources)] : [...S6_SOURCES];
 return options;
}

async function extractSource(source, signal) {
 const { stdout } = await execute('.venv/bin/python', ['-m', 'ingestion.s6', source], {
  cwd: 'services/ingestion', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  timeout: 120000, signal, killSignal: 'SIGTERM',
 });
 return stdout;
}

async function rpc(admin, name, params, signal) {
 const timeout = AbortSignal.timeout(name === 'ingest_s6_source' ? 125000 : 10000);
 return admin.rpc(name, params).abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout);
}

export async function pollS6Sources({ admin, sources = S6_SOURCES, force = false, signal, extract = extractSource, report = console.log }) {
 let failures = 0;
 for (const source of sources) {
  if (signal?.aborted) break;
  let token;
  try {
   const claim = await rpc(admin, 'claim_s6_source', { source_code: source, force_poll: force }, signal);
   if (claim.error) throw Error('Claim failed');
   token = claim.data;
  } catch {
   failures++;
   report({ source, status: 'claim_failed' });
   continue; // One unavailable source does not skip the others. An ambiguous claim expires in DB.
  }
  if (!token) { report({ source, status: 'not_due_or_leased' }); continue; }
  let phase = 'fetch_failed';
  const started = performance.now();
  try {
   const extracted = await extract(source, signal);
   phase = 'normalize_failed';
   const { batch, metrics } = typeof extracted === 'string' ? JSON.parse(extracted) : extracted;
   if (!Array.isArray(batch) || !metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw Error('Invalid extraction');
   signal?.throwIfAborted();
   phase = 'import_uncertain';
   const result = await rpc(admin, 'ingest_s6_source', {
    source_code: source, batch, metrics, fetched_at: new Date().toISOString(), claim_token: token,
   }, signal);
   if (result.error) {
    // A PostgreSQL error proves rollback. Network/gateway/abort errors may follow a commit.
    if (/^[0-9A-Z]{5}$/.test(result.error.code ?? '')) phase = 'import_failed';
    throw Error('Import failed');
   }
   report({ source, imported: result.data, ...metrics, total_elapsed_ms: Math.round(performance.now() - started) });
  } catch {
   failures++;
   let releaseFailed = false;
   if (phase !== 'import_uncertain') {
    // Release even during shutdown, with its own bounded request; token cannot release another worker's lease.
    try {
     const release = await rpc(admin, 'fail_s6_source', { source_code: source, claim_token: token, error_code: phase });
     releaseFailed = Boolean(release.error);
    } catch { releaseFailed = true; }
   }
   report({ source, status: phase, ...(phase === 'import_uncertain' ? { lease_retained: true } : { release_failed: releaseFailed }) });
  }
 }
 return { failures };
}

export async function watchS6Sources({ poll, intervalSeconds = 60, cycles = Infinity, signal, wait = sleep, report = console.log }) {
 let completed = 0;
 let failures = 0;
 while (!signal?.aborted && completed < cycles) {
  try { failures += (await poll()).failures; }
  catch { failures++; report({ status: 'cycle_failed' }); }
  completed++;
  if (signal?.aborted || completed >= cycles) break;
  try { await wait(intervalSeconds * 1000, undefined, { signal }); }
  catch {
   if (signal?.aborted) break;
   throw Error('Polling wait failed');
  }
 }
 return { cycles: completed, failures, stopped: Boolean(signal?.aborted) };
}
