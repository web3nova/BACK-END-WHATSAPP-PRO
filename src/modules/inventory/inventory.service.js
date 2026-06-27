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
      select: {
        id: true,
        name: true,
        stock: true,
        priceMinor: true,
        currency: true,
        inventory: {
          select: { quantity: true, reserved: true, lowStock: true, updatedAt: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);
  return paginatedResponse(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      stock: item.inventory?.quantity ?? item.stock,
      priceMinor: item.priceMinor,
      currency: item.currency,
      reserved: item.inventory?.reserved ?? 0,
      available: (item.inventory?.quantity ?? item.stock) - (item.inventory?.reserved ?? 0),
      lowStock: item.inventory?.lowStock ?? null,
      updatedAt: item.inventory?.updatedAt ?? null,
    })),
    total,
    page,
    limit,
  );
}

export async function adjust(productId, tenantId, { quantity, operation }) {
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) throw new NotFoundError('Product not found.');
  const inventory = await prisma.inventory.upsert({
    where: { productId },
    create: { tenantId, productId, quantity: product.stock },
    update: {},
  });

  let newStock;
  if (operation === 'set') {
    newStock = quantity;
  } else if (operation === 'add') {
    newStock = inventory.quantity + quantity;
  } else if (operation === 'subtract') {
    newStock = inventory.quantity - quantity;
  } else {
    throw new BadRequestError('Invalid operation. Allowed values: set, add, subtract.');
  }

  if (newStock < 0) throw new BadRequestError('Stock cannot go below zero.');

  return prisma.$transaction(async (tx) => {
    await tx.inventory.update({
      where: { productId },
      data: { quantity: newStock },
    });
    return tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
      select: { id: true, name: true, stock: true },
    });
  });
}
