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

test('legacy plain-integer shape is unaffected by an extra state argument', () => {
  assert.equal(resolveDeliveryFee({ nationwide: 500000 }, 'nationwide'), 500000);
  assert.equal(resolveDeliveryFee({ nationwide: 500000 }, 'nationwide', 'Lagos'), 500000);
  assert.equal(resolveDeliveryFee({ nationwide: 500000 }, 'nationwide', 'Kano'), 500000);
});

test('zoned shape returns the matching state override', () => {
  const deliveryFees = {
    nationwide: { default: 500000, states: { Lagos: 150000, Abuja: 300000 } },
  };
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Lagos'), 150000);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Abuja'), 300000);
});

test('zoned shape falls back to default for an unmatched state', () => {
  const deliveryFees = {
    nationwide: { default: 500000, states: { Lagos: 150000 } },
  };
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Kano'), 500000);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide'), 500000);
});

test('zoned shape with no usable default and no matching state returns 0', () => {
  assert.equal(resolveDeliveryFee({ nationwide: { states: { Lagos: 150000 } } }, 'nationwide', 'Kano'), 0);
  assert.equal(resolveDeliveryFee({ nationwide: { states: { Lagos: 150000 } } }, 'nationwide'), 0);
  assert.equal(resolveDeliveryFee({ nationwide: {} }, 'nationwide', 'Lagos'), 0);
});

test('zoned shape ignores invalid states/default values', () => {
  const deliveryFees = {
    nationwide: {
      default: 'not-a-number',
      states: { Lagos: -100, Abuja: 12.5, Kano: '500' },
    },
  };
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Lagos'), 0);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Abuja'), 0);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Kano'), 0);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Unknown'), 0);
});

test('mixed legacy and zoned methods resolve independently', () => {
  const deliveryFees = {
    local: 150000,
    nationwide: { default: 500000, states: { Lagos: 200000 } },
  };
  assert.equal(resolveDeliveryFee(deliveryFees, 'local'), 150000);
  assert.equal(resolveDeliveryFee(deliveryFees, 'local', 'Lagos'), 150000);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Lagos'), 200000);
  assert.equal(resolveDeliveryFee(deliveryFees, 'nationwide', 'Kano'), 500000);
});
