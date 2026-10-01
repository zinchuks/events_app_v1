import { localClients } from './lib/local-clients.mjs';
import { processS3Job, checkS3Receipts } from './lib/s3-transport.mjs';
const mode = process.argv[2] ?? 'fixture';
if (!['fixture', 'expo', 'receipts'].includes(mode)) throw Error('Usage: dispatch-s3-local.mjs fixture|expo|receipts');
const { admin } = localClients();
if (mode === 'receipts') console.log(JSON.stringify(await checkS3Receipts(admin)));
else {
 let processed = 0;
 while (processed < 50) { const result = await processS3Job(admin, mode); if (!result) break; processed++; }
 console.log(JSON.stringify({ transport: mode, processed, real_device_delivery: 'unverified' }));
}
