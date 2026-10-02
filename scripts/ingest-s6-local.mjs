// Only loopback Supabase. Explicit source allowlist; no secrets in CLI args/output.
import { localClients } from './lib/local-clients.mjs';
import { pollingOptions, pollS6Sources, watchS6Sources } from './lib/s6-polling.mjs';
const options = pollingOptions(process.argv.slice(2));
const { admin } = localClients();
const controller = new AbortController();
const stop = () => controller.abort();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const report = value => console.log(JSON.stringify(value));
const poll = () => pollS6Sources({ admin, ...options, signal: controller.signal, report });
try {
 if (options.watch) report({ status: 'worker_started', sources: options.sources, wake_interval_seconds: options.intervalSeconds });
 const result = options.watch
  ? await watchS6Sources({ poll, ...options, signal: controller.signal, report })
  : await poll();
 if (options.watch) report({ status: 'worker_stopped', ...result });
 if (result.failures) process.exitCode = 1;
} finally {
 process.off('SIGINT', stop);
 process.off('SIGTERM', stop);
}
