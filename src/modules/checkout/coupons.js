// Pure discount resolution — no I/O. Takes a coupon record (or null) and the
// server-computed subtotal (minor units) and returns the discount to apply.
export function resolveCouponDiscount(coupon, subtotalMinor) {
  if (!coupon || !coupon.active) return 0;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return 0;
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return 0;
  if (coupon.minSubtotal != null && subtotalMinor < coupon.minSubtotal) return 0;
  if (coupon.type === 'fixed') return Math.min(coupon.value, subtotalMinor);
  if (coupon.type === 'percent') return Math.min(Math.round(subtotalMinor * coupon.value / 100), subtotalMinor);
  return 0;
}

export default { resolveCouponDiscount };
