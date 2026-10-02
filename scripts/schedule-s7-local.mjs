// Local operator only. Default schedules inbox selections without external requests.
import { setTimeout as sleep } from 'node:timers/promises';
import { localClients } from './lib/local-clients.mjs';
import { rpc, processS7Job, checkS7Receipts } from './lib/s7-worker.mjs';
const args = process.argv.slice(2);
if (args.some(arg => !['--watch', '--expo', '--receipts'].includes(arg))) throw Error('Usage: schedule-s7-local.mjs [--watch] [--expo | --receipts]');
if (args.includes('--expo') && args.includes('--receipts')) throw Error('Select one transport operation');
const { admin } = localClients();
const abort = new AbortController();
process.on('SIGINT', () => abort.abort());process.on('SIGTERM', () => abort.abort());
do {
 let errors = 0;
 try {
  if (args.includes('--receipts')) console.log(JSON.stringify({ receipts_checked: await checkS7Receipts(admin), device_delivery_verified: false }));
  else {
   for (let n = 0; n < 50 && !abort.signal.aborted; n++) {
    const result = await rpc(admin, 'run_s7_scheduler');
    // Do not log user/digest IDs or device tokens.
    console.log(JSON.stringify({ stage: 'schedule', status: result.status, items: result.items ?? 0 }));
    if (result.status === 'idle') break;
   }
   if (args.includes('--expo')) for (let n = 0; n < 50 && !abort.signal.aborted; n++) {
    const status = await processS7Job(admin, args.includes('--expo') ? 'expo' : 'fixture');
    console.log(JSON.stringify({ stage: 'transport', status, real_transport: args.includes('--expo'), device_delivery_verified: false }));
    if (status === 'idle') break;
   }
   if (args.includes('--expo')) await checkS7Receipts(admin);
  }
 } catch { errors++; console.log(JSON.stringify({ stage: 'worker', status: 'operation_failed_leases_retained' })); }
 if (!args.includes('--watch')) { if (errors) process.exitCode = 1; break; }
 try { await sleep(60000, undefined, { signal: abort.signal }); } catch { break; }
} while (!abort.signal.aborted);
