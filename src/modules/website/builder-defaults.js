// Derives website-builder checkout defaults from onboarding + payment config.
// Read-time fallback only: explicit builder arrays always win, nothing is
// written back to the DB, so later payment-config changes surface instantly.

const DELIVERY_BY_STRUCTURE = {
  self: ['local', 'nationwide'],
  'third-party': ['local', 'nationwide'],
  pickup: ['pickup'],
  mixed: ['local', 'nationwide', 'pickup'],
};

// Cash on delivery is intentionally absent — merchants opt in via the builder.
const PAYMENT_PROVIDER_KEYS = [
  ['paystack', 'paystack'],
  ['monnify', 'monnify'],
  ['manual', 'bank'],
  ['blockradar', 'crypto'],
];

export function deriveBuilderDefaults(business, paymentConfigData) {
  const delivery = DELIVERY_BY_STRUCTURE[business?.deliveryStructure] || [];
  const pc = paymentConfigData || {};
  const payments = PAYMENT_PROVIDER_KEYS
    .filter(([provider]) => pc[provider]?.isActive)
    .map(([, key]) => key);
  return { delivery, payments };
}

export function withBuilderDefaults(builder, business, paymentConfigData) {
  const b = builder || {};
  const hasDelivery = Array.isArray(b.delivery) && b.delivery.length > 0;
  const hasPayments = Array.isArray(b.payments) && b.payments.length > 0;
  if (hasDelivery && hasPayments) return b;
  const defaults = deriveBuilderDefaults(business, paymentConfigData);
  return {
    ...b,
    delivery: hasDelivery ? b.delivery : defaults.delivery,
    payments: hasPayments ? b.payments : defaults.payments,
  };
}
