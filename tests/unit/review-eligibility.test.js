import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEligibleOrder } from '../../src/modules/reviews/eligibility.js';

test('single matching order returns its id', () => {
  const orders = [{ id: 'o1', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] }];
  assert.equal(findEligibleOrder(orders, 'p1'), 'o1');
});

test('multiple orders where an earlier one matches: earlier (most recent) wins', () => {
  const orders = [
    { id: 'newer', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] },
    { id: 'older', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] },
  ];
  assert.equal(findEligibleOrder(orders, 'p1'), 'newer');
});

test('a matching order already reviewed is skipped in favor of an older still-eligible match', () => {
  const orders = [
    { id: 'newer', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] },
    { id: 'older', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] },
  ];
  assert.equal(findEligibleOrder(orders, 'p1', ['newer']), 'older');
});

test('empty deliveredOrders returns null', () => {
  assert.equal(findEligibleOrder([], 'p1'), null);
});

test('no order contains the product returns null', () => {
  const orders = [{ id: 'o1', items: [{ productId: 'p2', name: 'Bag', priceMinor: 500, quantity: 1 }] }];
  assert.equal(findEligibleOrder(orders, 'p1'), null);
});

test('an order with empty items array does not crash and has no match', () => {
  const orders = [{ id: 'o1', items: [] }];
  assert.equal(findEligibleOrder(orders, 'p1'), null);
});

test('an item missing productId is treated as non-matching, does not crash', () => {
  const orders = [{ id: 'o1', items: [{ name: 'Mystery item', priceMinor: 500, quantity: 1 }] }];
  assert.equal(findEligibleOrder(orders, 'p1'), null);
});

test('default third param omitted treats as no exclusions', () => {
  const orders = [{ id: 'o1', items: [{ productId: 'p1', name: 'Shoe', priceMinor: 1000, quantity: 1 }] }];
  assert.equal(findEligibleOrder(orders, 'p1'), 'o1');
});
