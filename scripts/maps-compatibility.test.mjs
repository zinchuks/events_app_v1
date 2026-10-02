import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
test('patched MapLibre ESM transforms to Metro script syntax and ships its same-origin module worker', () => {
  const babel = require('@babel/core');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = fileURLToPath(new URL('../apps/mobile/babel.config.js', import.meta.url));
  const entry = require.resolve('maplibre-gl/dist/maplibre-gl.mjs');
  const output = babel.transformFileSync(entry, { configFile: config, babelrc: false,
    caller: { name: 'metro', bundler: 'metro', platform: 'web', isDev: true, supportsStaticESM: false } });
  // Parsing as a classic script rejects unresolved import.meta and ESM imports.
  assert.ok(babel.parseSync(output.code, { configFile: false, babelrc: false, sourceType: 'script' }));
  execFileSync(process.execPath, ['scripts/prepare-map-assets.mjs'], { cwd: root });
  for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
    const source = readFileSync(require.resolve(`maplibre-gl/dist/${file}`));
    const copied = readFileSync(new URL(`../apps/mobile/public/vendor/maplibre/6.11.2/${file}`, import.meta.url));
    assert.deepEqual(copied, source);
  }
});
