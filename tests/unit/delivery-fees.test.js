import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeliveryFee } from '../../src/modules/checkout/delivery-fees.js';

test('returns configured fee for method', () => {
  assert.equal(resolveDeliveryFee({ nationwide: 500000 }, 'nationwide'), 500000);
});

test('returns 0 for unconfigured method, missing config, or no method', () => {
  assert.equal(resolveDeliveryFee({}, 'local'), 0);
  assert.equal(resolveDeliveryFee(null, 'local'), 0);
  assert.equal(resolveDeliveryFee(undefined, 'local'), 0);
  assert.equal(resolveDeliveryFee({ local: 100 }, null), 0);
  assert.equal(resolveDeliveryFee({ local: 100 }, ''), 0);
});

test('ignores negative, zero, or non-integer configured values', () => {
  assert.equal(resolveDeliveryFee({ local: -5 }, 'local'), 0);
  assert.equal(resolveDeliveryFee({ local: 'x' }, 'local'), 0);
  assert.equal(resolveDeliveryFee({ local: 12.5 }, 'local'), 0);
  assert.equal(resolveDeliveryFee({ local: 0 }, 'local'), 0);
});
