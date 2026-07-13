import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderTotal } from '../../src/modules/checkout/checkout.pricing.js';

const productsById = new Map([
  ['p1', { id: 'p1', name: 'Ankara Dress', priceMinor: 500000 }],
  ['p2', { id: 'p2', name: 'Head Wrap', priceMinor: 150000 }],
]);

test('sums DB prices times quantities, ignoring client-sent priceMinor', () => {
  const items = [
    { productId: 'p1', quantity: 2, priceMinor: 1 },   // client lies: 1 kobo
    { productId: 'p2', quantity: 1, priceMinor: 1 },
  ];
  assert.equal(computeOrderTotal(items, productsById), 1150000);
});

test('throws when a productId is unknown', () => {
  assert.throws(
    () => computeOrderTotal([{ productId: 'nope', quantity: 1 }], productsById),
    /Product not found/,
  );
});

test('throws on non-positive quantity', () => {
  assert.throws(
    () => computeOrderTotal([{ productId: 'p1', quantity: 0 }], productsById),
    /quantity/i,
  );
});
