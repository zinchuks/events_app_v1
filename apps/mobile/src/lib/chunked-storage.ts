export type KeyStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Manifest = { revision: string; count: number };
function parse(value: string | null): Manifest | null {
  if (!value) return null;
  const result = JSON.parse(value) as Manifest;
  if (!/^[a-z0-9-]+$/.test(result.revision) || !Number.isInteger(result.count) || result.count < 1 || result.count > 128) {
    throw new Error('Invalid session storage');
  }
  return result;
}
function chunks(value: string): string[] {
  const result: string[] = [];
  let chunk = '', size = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    const bytes = point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
    if (size + bytes > 1800) { result.push(chunk); chunk = ''; size = 0; }
    chunk += char; size += bytes;
  }
  result.push(chunk);
  if (result.length > 128) throw new Error('Session exceeds secure storage limit');
  return result;
}
// Small encrypted chunks, serialized operations, manifest switched only after all writes.
export function createChunkedStorage(store: KeyStore): KeyStore {
  let pending: Promise<unknown> = Promise.resolve();
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation, operation);
    pending = next.catch(() => undefined);
    return next;
  }
  const itemKey = (key: string, revision: string, index: number) => `${key}.${revision}.${index}`;
  async function clean(key: string, manifest: Manifest) {
    for (let i = 0; i < manifest.count; i++) await store.removeItem(itemKey(key, manifest.revision, i));
  }
  return {
    getItem: key => serialized(async () => {
      const manifest = parse(await store.getItem(key));
      if (!manifest) return null;
      const values = await Promise.all(Array.from({ length: manifest.count }, (_, i) => store.getItem(itemKey(key, manifest.revision, i))));
      if (values.some(value => value === null)) throw new Error('Incomplete session storage');
      return values.join('');
    }),
    setItem: (key, value) => serialized(async () => {
      const previous = parse(await store.getItem(key));
      const values = chunks(value);
      const next = { revision: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, count: values.length };
      try {
        for (let i = 0; i < values.length; i++) await store.setItem(itemKey(key, next.revision, i), values[i]);
        await store.setItem(key, JSON.stringify(next));
      } catch (error) { await clean(key, next); throw error; }
      if (previous) await clean(key, previous);
    }),
    removeItem: key => serialized(async () => {
      const previous = parse(await store.getItem(key));
      await store.removeItem(key);
      if (previous) await clean(key, previous);
    })
  };
}
