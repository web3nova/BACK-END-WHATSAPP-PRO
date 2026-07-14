import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCouponDiscount } from '../../src/modules/checkout/coupons.js';

function baseCoupon(overrides = {}) {
  return {
    type: 'fixed',
    value: 500,
    minSubtotal: null,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    ...overrides,
  };
}

test('active fixed coupon under subtotal discounts the full fixed value', () => {
  const coupon = baseCoupon({ type: 'fixed', value: 500 });
  assert.equal(resolveCouponDiscount(coupon, 2000), 500);
});

test('active fixed coupon exceeding subtotal is clamped to the subtotal', () => {
  const coupon = baseCoupon({ type: 'fixed', value: 5000 });
  assert.equal(resolveCouponDiscount(coupon, 2000), 2000);
});

test('active percent coupon rounds to the nearest minor unit', () => {
  const coupon = baseCoupon({ type: 'percent', value: 15 });
  // 15% of 999 = 149.85 -> rounds to 150
  assert.equal(resolveCouponDiscount(coupon, 999), 150);
});

test('inactive coupon returns 0', () => {
  const coupon = baseCoupon({ active: false });
  assert.equal(resolveCouponDiscount(coupon, 2000), 0);
});

test('expired coupon returns 0', () => {
  const coupon = baseCoupon({ expiresAt: new Date(Date.now() - 1000 * 60 * 60) });
  assert.equal(resolveCouponDiscount(coupon, 2000), 0);
});

test('coupon with maxUses reached returns 0', () => {
  const coupon = baseCoupon({ maxUses: 3, usedCount: 3 });
  assert.equal(resolveCouponDiscount(coupon, 2000), 0);
});

test('coupon with minSubtotal not met returns 0', () => {
  const coupon = baseCoupon({ minSubtotal: 5000 });
  assert.equal(resolveCouponDiscount(coupon, 2000), 0);
});

test('null coupon returns 0', () => {
  assert.equal(resolveCouponDiscount(null, 2000), 0);
});

test('unknown coupon type returns 0', () => {
  const coupon = baseCoupon({ type: 'free-delivery' });
  assert.equal(resolveCouponDiscount(coupon, 2000), 0);
});
