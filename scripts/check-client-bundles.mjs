import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
assert.ok(status.SERVICE_ROLE_KEY);
let count = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else { assert.ok(!readFileSync(file).includes(Buffer.from(status.SERVICE_ROLE_KEY)), 'Server credential detected in client export'); count++; }
  }
}
scan('apps/mobile/dist');
assert.ok(count > 0);
console.log(`Client export server-key boundary: pass (${count} files; key value not printed).`);
