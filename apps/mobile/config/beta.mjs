// Validate before a beta cloud build can accidentally embed loopback/development configuration.
export function assertBetaConfig({ variant, projectId, url, key }) {
 if (variant !== 'staging' || !projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw Error('Beta requires staging and your own EAS_PROJECT_ID');
 let endpoint; try { endpoint = new URL(url); } catch { throw Error('Beta requires a hosted staging API'); }
 if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
  /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(endpoint.hostname) || /\.(local|localhost|invalid|test)$/.test(endpoint.hostname)) throw Error('Beta requires a hosted HTTPS staging API');
 if (!key || key.startsWith('sb_secret_')) throw Error('Beta requires a public Supabase key');
 // Legacy Supabase JWT keys expose a role in the payload. Fail closed if not anon.
 if (!key.startsWith('sb_publishable_')) {
  try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw Error(); }
  catch { throw Error('Beta requires a public anon/publishable key'); }
 }
}
