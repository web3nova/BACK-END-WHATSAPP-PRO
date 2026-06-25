import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

export async function list(tenantId, query) {
  const { page, limit, skip } = paginate(query);
  const where = { tenantId };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, stock: true, priceMinor: true, currency: true },
    }),
    prisma.product.count({ where }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

export async function adjust(productId, tenantId, { quantity, operation }) {
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) throw new NotFoundError('Product not found.');

  let newStock;
  if (operation === 'set') {
    newStock = quantity;
  } else if (operation === 'add') {
    newStock = product.stock + quantity;
  } else if (operation === 'subtract') {
    newStock = product.stock - quantity;
  } else {
    throw new BadRequestError('Invalid operation. Allowed values: set, add, subtract.');
  }

  if (newStock < 0) throw new BadRequestError('Stock cannot go below zero.');

  return prisma.product.update({
    where: { id: productId },
    data: { stock: newStock },
    select: { id: true, name: true, stock: true },
  });
}
