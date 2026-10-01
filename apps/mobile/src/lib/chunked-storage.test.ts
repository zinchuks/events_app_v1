import { createChunkedStorage, type KeyStore } from './chunked-storage';
function fixture() {
  const values = new Map<string, string>();
  const store: KeyStore = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); }
  };
  return { values, store };
}
test('large Unicode sessions round-trip in encrypted-store sized chunks and clear on logout', async () => {
  const { values, store } = fixture();
  const adapter = createChunkedStorage(store);
  const session = 'Україна 🌍'.repeat(1500);
  await adapter.setItem('auth', session);
  expect(await adapter.getItem('auth')).toBe(session);
  for (const [key, value] of values) {
    if (key !== 'auth') expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(1800);
  }
  await adapter.removeItem('auth');
  expect(values.size).toBe(0);
});
test('failed write keeps the old session and removes partially written chunks', async () => {
  const { values, store } = fixture();
  const adapter = createChunkedStorage(store);
  await adapter.setItem('auth', 'old');
  const original = new Map(values);
  const set = store.setItem;
  let writes = 0;
  store.setItem = async (key, value) => { if (++writes === 2) throw new Error('device locked'); await set(key, value); };
  await expect(adapter.setItem('auth', 'x'.repeat(5000))).rejects.toThrow('device locked');
  expect(await adapter.getItem('auth')).toBe('old');
  expect(values).toEqual(original);
});
test('concurrent replacement and logout leave no session behind', async () => {
  const { values, store } = fixture();
  const adapter = createChunkedStorage(store);
  await Promise.all([adapter.setItem('auth', 'first'), adapter.setItem('auth', 'second'), adapter.removeItem('auth')]);
  expect(values.size).toBe(0);
});
