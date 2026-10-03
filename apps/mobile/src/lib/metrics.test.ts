import type { Session } from '@supabase/supabase-js';
import { sendMetric, setMetricPreference } from './metrics';
const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const session = (owner: string) => ({ access_token: 'test-only-bearer-' + owner, user: { id: owner } } as Session);
beforeEach(() => {
 process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
 process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-only-public-key';
});
afterEach(() => {
 global.fetch = originalFetch;
 if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
 if (originalKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
 jest.useRealTimers();
});
it('a delayed metric and preference use the captured owner bearer, with no user IDs or text in the body', async () => {
 let resolve!: (response: Response) => void;
 const pending = new Promise<Response>(r => { resolve = r; });
 const mock = jest.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ ok: true, json: async () => false });
 global.fetch = mock;
 const first = sendMetric('event_saved', session('A'));
 await setMetricPreference(false, session('B'));
 expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only-bearer-A');
 expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ kind: 'event_saved' });
 expect(mock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-only-bearer-B');
 expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ enabled: false });
 resolve({ ok: true } as Response); await first;
});
it('offline metrics fail quietly once and cannot block an action or retry under a different owner', async () => {
 const mock = jest.fn().mockRejectedValue(new Error('offline')); global.fetch = mock;
 await expect(sendMetric('digest_opened', session('A'))).resolves.toBeUndefined();
 expect(mock).toHaveBeenCalledTimes(1);
 await expect(setMetricPreference(true, session('A'))).rejects.toThrow('offline');
});
it('failed or mismatched consent responses never become an accepted preference', async () => {
 global.fetch = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => false });
 await expect(setMetricPreference(true, session('A'))).rejects.toThrow('Preference unavailable');
 await expect(setMetricPreference(true, session('A'))).rejects.toThrow('Preference unavailable');
});
it('a stalled metrics request is aborted and has no retry or persistent queue', async () => {
 jest.useFakeTimers(); const mock = jest.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
 })); global.fetch = mock;
 const pending = sendMetric('event_saved', session('A')); await jest.advanceTimersByTimeAsync(5000);
 await expect(pending).resolves.toBeUndefined(); expect(mock).toHaveBeenCalledTimes(1);
});
