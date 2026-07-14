// Pure: given a customer's delivered orders (caller passes newest-first),
// find the most recent order eligible for reviewing a given product —
// i.e. not already reviewed and containing the product.
export function findEligibleOrder(deliveredOrders, productId, alreadyReviewedOrderIds = []) {
  const reviewed = new Set(alreadyReviewedOrderIds);
  for (const order of deliveredOrders) {
    if (reviewed.has(order.id)) continue;
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.some((item) => item?.productId === productId)) return order.id;
  }
  return null;
}

export default { findEligibleOrder };
