import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateQuantities, trackedShortages } from '../../src/modules/checkout/stock.js';

test('aggregateQuantities sums duplicate lines for the same product', () => {
  const items = [
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
    { productId: 'p1', quantity: 3 },
  ];
  const result = aggregateQuantities(items);
  assert.equal(result.get('p1'), 5);
  assert.equal(result.get('p2'), 1);
});

test('aggregateQuantities returns an empty map for empty items', () => {
  const result = aggregateQuantities([]);
  assert.equal(result.size, 0);
});

test('trackedShortages ignores untracked products even when stock is insufficient', () => {
  const products = [{ id: 'p1', name: 'Untracked', trackStock: false, stock: 0 }];
  const quantities = new Map([['p1', 5]]);
  assert.deepEqual(trackedShortages(products, quantities), []);
});

test('trackedShortages does not flag a tracked product with enough stock', () => {
  const products = [{ id: 'p1', name: 'Tracked', trackStock: true, stock: 10 }];
  const quantities = new Map([['p1', 5]]);
  assert.deepEqual(trackedShortages(products, quantities), []);
});

test('trackedShortages flags a tracked product with insufficient stock, including its name', () => {
  const products = [{ id: 'p1', name: 'Tracked Low', trackStock: true, stock: 2 }];
  const quantities = new Map([['p1', 5]]);
  assert.deepEqual(trackedShortages(products, quantities), [{ productId: 'p1', name: 'Tracked Low' }]);
});

test('trackedShortages returns empty array for empty inputs', () => {
  assert.deepEqual(trackedShortages([], new Map()), []);
});
