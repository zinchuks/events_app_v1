// Backwards-compatible local command. All operational Madrid imports use S6 facts/leases.
import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['scripts/ingest-s6-local.mjs','madrid','--force'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
