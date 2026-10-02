import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('maplibre-gl/package.json');
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
if (manifest.version !== '6.11.2') throw new Error('Review map worker assets before changing the pinned MapLibre version.');
const target = fileURLToPath(new URL('../apps/mobile/public/vendor/maplibre/6.11.2/', import.meta.url));
mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs.map', 'maplibre-gl-shared.mjs.map']) {
  copyFileSync(join(dirname(packagePath), 'dist', file), join(target, file));
}
copyFileSync(join(dirname(packagePath), 'LICENSE.txt'), join(target, 'LICENSE.txt'));
console.log('Prepared pinned MapLibre module worker/shared assets on the same origin.');
