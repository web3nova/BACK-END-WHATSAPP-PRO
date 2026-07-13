import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBuilderDefaults, withBuilderDefaults } from '../../src/modules/website/builder-defaults.js';

// --- deriveBuilderDefaults: delivery mapping ---

test('self delivery structure derives local + nationwide', () => {
  const { delivery } = deriveBuilderDefaults({ deliveryStructure: 'self' }, {});
  assert.deepEqual(delivery, ['local', 'nationwide']);
});

test('third-party delivery structure derives local + nationwide', () => {
  const { delivery } = deriveBuilderDefaults({ deliveryStructure: 'third-party' }, {});
  assert.deepEqual(delivery, ['local', 'nationwide']);
});

test('pickup delivery structure derives pickup only', () => {
  const { delivery } = deriveBuilderDefaults({ deliveryStructure: 'pickup' }, {});
  assert.deepEqual(delivery, ['pickup']);
});

test('mixed delivery structure derives local + nationwide + pickup', () => {
  const { delivery } = deriveBuilderDefaults({ deliveryStructure: 'mixed' }, {});
  assert.deepEqual(delivery, ['local', 'nationwide', 'pickup']);
});

test('unknown or missing delivery structure derives empty delivery', () => {
  assert.deepEqual(deriveBuilderDefaults({ deliveryStructure: 'weird' }, {}).delivery, []);
  assert.deepEqual(deriveBuilderDefaults({}, {}).delivery, []);
  assert.deepEqual(deriveBuilderDefaults(null, {}).delivery, []);
});

// --- deriveBuilderDefaults: payments mapping ---

test('active providers map to payment keys', () => {
  const { payments } = deriveBuilderDefaults({}, {
    paystack: { isActive: true },
    monnify: { isActive: true },
    manual: { isActive: true },
    blockradar: { isActive: true },
  });
  assert.deepEqual(payments, ['paystack', 'monnify', 'bank', 'crypto']);
});

test('inactive or missing providers are excluded', () => {
  const { payments } = deriveBuilderDefaults({}, {
    paystack: { isActive: false },
    manual: { isActive: true },
  });
  assert.deepEqual(payments, ['bank']);
});

test('missing payment config derives empty payments', () => {
  assert.deepEqual(deriveBuilderDefaults({}, null).payments, []);
  assert.deepEqual(deriveBuilderDefaults({}, undefined).payments, []);
});

test('cash is never auto-derived', () => {
  const { payments } = deriveBuilderDefaults({ deliveryStructure: 'mixed' }, {
    paystack: { isActive: true },
  });
  assert.ok(!payments.includes('cash'));
});

// --- withBuilderDefaults: fallback only when empty, per array ---

test('explicit builder arrays win over derived defaults', () => {
  const builder = { delivery: ['digital'], payments: ['cash'] };
  const result = withBuilderDefaults(builder, { deliveryStructure: 'mixed' }, { paystack: { isActive: true } });
  assert.deepEqual(result.delivery, ['digital']);
  assert.deepEqual(result.payments, ['cash']);
});

test('empty arrays fall back independently', () => {
  const builder = { delivery: ['pickup'], payments: [] };
  const result = withBuilderDefaults(builder, { deliveryStructure: 'self' }, { manual: { isActive: true } });
  assert.deepEqual(result.delivery, ['pickup']);
  assert.deepEqual(result.payments, ['bank']);
});

test('missing builder object falls back for both arrays', () => {
  const result = withBuilderDefaults(undefined, { deliveryStructure: 'pickup' }, { paystack: { isActive: true } });
  assert.deepEqual(result.delivery, ['pickup']);
  assert.deepEqual(result.payments, ['paystack']);
});

test('other builder keys are preserved', () => {
  const builder = { hero: { headline: 'Hi' }, delivery: [], payments: [] };
  const result = withBuilderDefaults(builder, { deliveryStructure: 'pickup' }, {});
  assert.deepEqual(result.hero, { headline: 'Hi' });
});
