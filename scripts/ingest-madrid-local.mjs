// Allowlisted live source -> stdlib Python normalization -> atomic DB import.
import { execFileSync } from 'node:child_process';
import { localClients } from './lib/local-clients.mjs';
const { admin } = localClients();
const response = await fetch('https://datos.madrid.es/egob/catalogo/300107-0-agenda-actividades-eventos.json', { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error('Madrid HTTP ' + response.status);
const chunks = []; let length = 0;
for await (const chunk of response.body) {
 length += chunk.length;
 if (length > 8 * 1024 * 1024) throw Error('Madrid payload exceeds 8 MiB');
 chunks.push(chunk);
}
const payload = Buffer.concat(chunks).toString('utf8');
const batch = JSON.parse(execFileSync('.venv/bin/python', ['-m', 'ingestion.madrid'], { cwd: 'services/ingestion', input: payload, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
if (!batch.length) throw Error('Empty normalized batch; refusing to mark source healthy');
const fetched_at = new Date().toISOString();
const { data, error } = await admin.rpc('ingest_madrid', { batch, fetched_at });
if (error) throw Error(error.code + ': ' + error.message);
console.log(JSON.stringify({ imported: data, payload_records: JSON.parse(payload)['@graph'].length, checked_at: fetched_at }));
