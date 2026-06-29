import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

async function findOwned(id, tenantId) {
  const product = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!product) throw new NotFoundError('Product not found.');
  return product;
}

export async function list(tenantId, query) {
  const { page, limit, skip } = paginate(query);
  const where = { tenantId };
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.product.count({ where }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

export async function getById(id, tenantId) {
  return findOwned(id, tenantId);
}

export async function create(tenantId, data) {
  const { stock = 0, ...productData } = data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { tenantId, ...productData, stock } });
    await tx.inventory.create({
      data: { tenantId, productId: product.id, quantity: stock },
    });
    return product;
  });
}

export async function update(id, tenantId, data) {
  await findOwned(id, tenantId);
  const { stock, ...productData } = data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: stock === undefined ? productData : { ...productData, stock },
    });

    if (stock !== undefined) {
      await tx.inventory.upsert({
        where: { productId: id },
        create: { tenantId, productId: id, quantity: stock },
        update: { quantity: stock },
      });
    }

    return product;
  });
}

export async function remove(id, tenantId) {
  await findOwned(id, tenantId);
  await prisma.product.delete({ where: { id } });
}
