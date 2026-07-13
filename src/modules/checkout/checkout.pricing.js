import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../common/errors/index.js';

// Pure: total from DB product prices only. Client-sent priceMinor is never trusted.
export function computeOrderTotal(items, productsById) {
  let total = 0;
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new BadRequestError(`Invalid quantity for product ${item.productId}`);
    }
    const product = productsById.get(item.productId);
    if (!product) {
      throw new BadRequestError(`Product not found: ${item.productId}`);
    }
    total += product.priceMinor * qty;
  }
  return total;
}

// Loads products for the tenant and returns server-priced items + total.
export async function priceItems(tenantId, items) {
  const ids = [...new Set(items.map(i => i.productId))];
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, priceMinor: true },
  });
  const productsById = new Map(products.map(p => [p.id, p]));
  const totalMinor = computeOrderTotal(items, productsById);
  const pricedItems = items.map(i => {
    const p = productsById.get(i.productId);
    return { ...i, name: p.name, priceMinor: p.priceMinor };
  });
  return { totalMinor, items: pricedItems };
}
