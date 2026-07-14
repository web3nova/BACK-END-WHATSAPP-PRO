// Per-method delivery fee from builder JSON (minor units). Server-side
// only — client-sent totals are never trusted.
//
// `deliveryFees[method]` may be either:
//   - a plain positive integer (legacy flat fee), or
//   - an object `{ default: <int>, states: { "<State>": <int> } }` for
//     optional per-state zone overrides.
export function resolveDeliveryFee(deliveryFees, method, state) {
  if (!deliveryFees || !method) return 0;
  const entry = deliveryFees[method];

  if (Number.isInteger(entry)) {
    return entry > 0 ? entry : 0;
  }

  if (entry && typeof entry === 'object') {
    const stateFee = state ? entry.states?.[state] : undefined;
    if (Number.isInteger(stateFee) && stateFee > 0) return stateFee;

    const defaultFee = entry.default;
    if (Number.isInteger(defaultFee) && defaultFee > 0) return defaultFee;

    return 0;
  }

  return 0;
}
