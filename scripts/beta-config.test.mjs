import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBetaConfig } from '../apps/mobile/config/beta.mjs';
const config = { variant: 'staging', projectId: '11111111-1111-4111-8111-111111111111', url: 'https://synthetic-project.supabase.co', key: 'sb_publishable_synthetic' };
test('beta rejects missing project, development and local/credential-bearing endpoints', () => {
 for (const patch of [{ projectId: undefined }, { variant: 'development' }, ...['http://127.0.0.1:54321', 'https://localhost', 'https://192.168.1.2', 'https://api.local', 'https://u:p@api.example.com', 'https://api.example.com?token=test', 'https://api.example.com/rest/v1'].map(url => ({ url }))]) assert.throws(() => assertBetaConfig({ ...config, ...patch }));
});
test('a server-role key cannot be embedded into a beta', () => {
 const serviceJwt = 'synthetic.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.synthetic';
 for (const key of [undefined, 'sb_secret_synthetic', serviceJwt, 'malformed']) assert.throws(() => assertBetaConfig({ ...config, key }));
 assert.doesNotThrow(() => assertBetaConfig(config));
 assert.doesNotThrow(() => assertBetaConfig({ ...config, key: 'synthetic.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.synthetic' }));
});
