import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getVariant } from '../apps/mobile/config/variants.mjs';

test('unknown environment fails instead of silently using development', () => {
  for (const value of ['production', 'stagng', 'toString', '__proto__']) {
    assert.throws(() => getVariant(value), /Unsupported APP_VARIANT/);
  }
});

test('development and staging can coexist without IDs or deep links colliding', () => {
  const dev = getVariant();
  const staging = getVariant('staging');
  assert.equal(dev.variant, 'development');
  assert.notEqual(dev.id, staging.id);
  assert.notEqual(dev.scheme, staging.scheme);
  assert.notEqual(dev.name, staging.name);
});
