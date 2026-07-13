// Pure helpers for opt-in stock enforcement. No I/O here — see checkout.service.js
// for the transactional decrement that uses these.

// aggregateQuantities(items) -> Map productId -> total qty (summing duplicate lines)
export function aggregateQuantities(items) {
  const byId = new Map();
  for (const item of items) {
    byId.set(item.productId, (byId.get(item.productId) || 0) + Number(item.quantity));
  }
  return byId;
}

// trackedShortages(products, quantitiesById) -> array of { productId, name } for products
// with trackStock true and stock < requested qty
export function trackedShortages(products, quantitiesById) {
  return products
    .filter((p) => p.trackStock && p.stock < (quantitiesById.get(p.id) || 0))
    .map((p) => ({ productId: p.id, name: p.name }));
}
