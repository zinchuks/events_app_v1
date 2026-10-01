import { readFileSync } from 'node:fs';
import { getVariant } from '../apps/mobile/config/variants.mjs';

// Exact allowlist: example files cannot silently introduce public server secrets.
const examples = {
  'apps/mobile/.env.example': ['APP_VARIANT', 'EAS_PROJECT_ID', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  'apps/mobile/.env.staging.example': ['APP_VARIANT', 'EAS_PROJECT_ID', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  'apps/admin/.env.example': ['VITE_APP_ENV'],
  'apps/admin/.env.staging.example': ['VITE_APP_ENV'],
  'services/ingestion/.env.example': ['APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'],
  'services/ingestion/.env.staging.example': ['APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']
};

for (const [file, allowed] of Object.entries(examples)) {
  const entries = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    .split('\n').filter(line => line && !line.startsWith('#'));
  const keys = entries.map(line => line.split('=')[0]);
  if (keys.length !== allowed.length || !allowed.every(key => keys.includes(key))) {
    throw new Error(`Unexpected configuration names in ${file}`);
  }
  for (const entry of entries) {
    const [key, ...parts] = entry.split('=');
    const value = parts.join('=');
    if (key.endsWith('ENV') || key === 'APP_VARIANT') {
      if (value !== (file.includes('staging') ? 'staging' : 'development')) {
        throw new Error(`Wrong environment in ${file}`);
      }
    } else if (value !== '') {
      throw new Error(`Example credentials must be empty in ${file}`);
    }
  }
}
const dev = getVariant('development');
const staging = getVariant('staging');
if (dev.id === staging.id || dev.scheme === staging.scheme) throw new Error('Variants must be distinct');
console.log('Environment examples and separate development/staging IDs are valid.');
