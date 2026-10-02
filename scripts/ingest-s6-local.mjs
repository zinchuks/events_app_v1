// Only loopback Supabase. Explicit source allowlist; no secrets in CLI args/output.
import { execFileSync } from 'node:child_process';
import { localClients } from './lib/local-clients.mjs';
const sources = ['madrid', 'toronto', 'helsinki'];
const args = process.argv.slice(2);
if (args.some(arg => !sources.includes(arg) && arg !== '--force')) throw Error('Usage: ingest-s6-local.mjs [madrid|toronto|helsinki] [--force]');
const selected = args.filter(arg => sources.includes(arg));
const { admin } = localClients();
let failed = false;
for (const source of selected.length ? [...new Set(selected)] : sources) {
 const claim = await admin.rpc('claim_s6_source', { source_code: source, force_poll: args.includes('--force') });
 if (claim.error) throw Error('Source claim failed: ' + claim.error.code);
 if (!claim.data) { console.log(JSON.stringify({ source, status: 'not_due_or_leased' })); continue; }
 let phase = 'fetch_failed';
 const started = performance.now();
 try {
  const output = execFileSync('.venv/bin/python', ['-m', 'ingestion.s6', source], { cwd: 'services/ingestion', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  phase = 'normalize_failed';
  const { batch, metrics } = JSON.parse(output);
  phase = 'import_failed';
  const result = await admin.rpc('ingest_s6_source', { source_code: source, batch, metrics, fetched_at: new Date().toISOString(), claim_token: claim.data });
  if (result.error) throw Error('Atomic import failed: ' + result.error.code);
  console.log(JSON.stringify({ source, imported: result.data, ...metrics, total_elapsed_ms: Math.round(performance.now()-started) }));
 } catch {
  failed = true;
  const release = await admin.rpc('fail_s6_source', { source_code: source, claim_token: claim.data, error_code: phase });
  console.error(JSON.stringify({ source, status: phase, release_failed: Boolean(release.error) }));
 }
}
if (failed) process.exitCode = 1;
