import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const token = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const publicSecret = /(?:EXPO_PUBLIC_|VITE_)(?:SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|ANTHROPIC_API_KEY|REVENUECAT_WEBHOOK_SECRET)/;
for (const file of new Set(files)) {
  if (statSync(file).isDirectory()) continue;
  if (/(?:^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.example')) {
    throw new Error(`Local environment file must not be tracked: ${file}`);
  }
  const content = readFileSync(file, 'utf8');
  if (token.test(content)) throw new Error(`Possible secret in ${file}; review without printing its value.`);
  if (file.startsWith('apps/') && publicSecret.test(content)) {
    throw new Error(`Server-only configuration exposed in client source: ${file}`);
  }
}
console.log('Tracked/unignored files contain no known token/private-key patterns or public server-key names.');
