import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';
import { getAssetUrl, uploadAsset } from '../../common/utils/uploadAsset.js';
import { PRODUCT_CATEGORIES } from '../../common/constants/businessProfile.js';

async function findOwned(id, tenantId) {
  const product = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!product) throw new NotFoundError('Product not found.');
  return withFreshImageUrl(product);
}

async function withFreshImageUrl(product) {
  if (!product?.imageStorageKey) return product;
  return {
    ...product,
    imageUrl: await getAssetUrl(product.imageStorageKey, product.imageUrl),
  };
}

async function withFreshImageUrls(products) {
  return Promise.all(products.map((product) => withFreshImageUrl(product)));
}

export async function list(tenantId, query) {
  const { page, limit, skip } = paginate(query);
  const where = { tenantId };
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  if (query.category) where.category = query.category;

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.product.count({ where }),
  ]);
  return paginatedResponse(await withFreshImageUrls(items), total, page, limit);
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
    return withFreshImageUrl(product);
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

    return withFreshImageUrl(product);
  });
}

export async function remove(id, tenantId) {
  await findOwned(id, tenantId);
  await prisma.product.delete({ where: { id } });
}

export async function uploadImage(id, tenantId, file) {
  await findOwned(id, tenantId);
  const asset = await uploadAsset({ tenantId, folder: 'product-images', file });
  const product = await prisma.product.update({
    where: { id },
    data: {
      imageUrl: asset.url,
      imageStorageKey: asset.storageKey,
    },
  });
  return withFreshImageUrl(product);
}

export function listCategories() {
  return PRODUCT_CATEGORIES;
}
