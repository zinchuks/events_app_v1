import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('@expo/metro/package.json'));
const { getAssetData } = expoRequire('metro/private/Assets');

// Reproduces the real bundling failure after image-size's security update.
test('Expo Metro reads a real router PNG through patched image-size', async () => {
  const asset = join(dirname(require.resolve('expo-router/package.json')), 'assets/file.png');
  const data = await getAssetData(asset, 'router-assets', [], null, '/assets');
  assert.equal(data.type, 'png');
  assert.ok(data.width > 0);
  assert.ok(data.height > 0);
  assert.ok(data.files.includes(asset));
});
