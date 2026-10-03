import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:54321', 'Only the local stack may be configured automatically');
const file = 'apps/mobile/.env.local';
const value = `APP_VARIANT=development\nEXPO_PUBLIC_SUPABASE_URL=${status.API_URL}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`;
if (existsSync(file)) {
  assert.equal(readFileSync(file, 'utf8'), value, 'Existing local configuration differs; it was not overwritten');
} else writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
console.log('Local public mobile configuration ready in ignored apps/mobile/.env.local; no server credentials copied.');

const adminFile='apps/admin/.env.local';
const adminValue=`VITE_APP_ENV=development\nVITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`;
if(existsSync(adminFile))assert.equal(readFileSync(adminFile,'utf8'),adminValue,'Existing admin configuration differs; not overwritten');
else writeFileSync(adminFile,adminValue,{flag:'wx',mode:0o600});
console.log('Local public admin configuration ready; no server credentials copied.');
