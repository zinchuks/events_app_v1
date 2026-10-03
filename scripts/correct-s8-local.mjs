// Explicit local operator correction. Server credentials stay in memory; no source reset.
import { readFile } from 'node:fs/promises';
import { localClients } from './lib/local-clients.mjs';
import { rpc } from './lib/s7-worker.mjs';
const [selected_occurrence,file,reason,...extra]=process.argv.slice(2);
if(extra.length||!selected_occurrence||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(selected_occurrence)||!file||!reason)throw Error('Usage: correct-s8-local.mjs OCCURRENCE_UUID PATCH_JSON_FILE REASON');
const text=await readFile(file,'utf8');if(text.length>2000)throw Error('Correction too large');
const patch=JSON.parse(text);const {admin}=localClients();
await rpc(admin,'correct_s8_occurrence',{selected_occurrence,patch,reason});
console.log(JSON.stringify({correction:'applied_and_audited',external_requests:0}));
