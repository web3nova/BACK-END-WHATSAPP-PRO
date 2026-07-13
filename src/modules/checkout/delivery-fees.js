// Flat per-method delivery fee from builder JSON (minor units). Server-side
// only — client-sent totals are never trusted.
export function resolveDeliveryFee(deliveryFees, method) {
  if (!deliveryFees || !method) return 0;
  const fee = deliveryFees[method];
  return Number.isInteger(fee) && fee > 0 ? fee : 0;
}
