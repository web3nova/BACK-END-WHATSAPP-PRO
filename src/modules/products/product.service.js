import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';
import { uploadAsset } from '../../common/utils/uploadAsset.js';
import { PRODUCT_CATEGORIES } from '../../common/constants/businessProfile.js';

async function findOwned(id, tenantId) {
  const product = await prisma.product.findFirst({
    where: { id, tenantId },
    include: { variants: true },
  });
  if (!product) throw new NotFoundError('Product not found.');
  return withFreshImageUrls(product);
}

function proxyAssetUrl(storageKey) {
  return `/assets/product-images/${storageKey}`;
}

function withFreshImageUrl(product) {
  if (!product?.imageStorageKey) return product;
  return {
    ...product,
    imageUrl: proxyAssetUrl(product.imageStorageKey),
  };
}

function withFreshImageUrls(product) {
  if (!product) return product;
  const result = withFreshImageUrl(product);
  if (result.galleryImages?.length) {
    result.galleryImages = result.galleryImages.map((img) => {
      if (img.storageKey) {
        return { ...img, url: proxyAssetUrl(img.storageKey) };
      }
      return img;
    });
  }
  if (result.variants?.length) {
    result.variants = result.variants.map((v) => {
      if (v.imageStorageKey) {
        return { ...v, imageUrl: proxyAssetUrl(v.imageStorageKey) };
      }
      return v;
    });
  }
  return result;
}

function withFreshImageUrlsList(products) {
  return products.map((product) => withFreshImageUrls(product));
}

function buildWhere(tenantId, query) {
  const where = { tenantId };
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  if (query.category) where.category = query.category;
  if (query.brand) where.brand = { contains: query.brand, mode: 'insensitive' };
  if (query.isFeatured !== undefined) where.isFeatured = query.isFeatured;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.tag) where.tags = { has: query.tag };
  if (query.collection) where.collections = { has: query.collection };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.priceMinor = {};
    if (query.minPrice !== undefined) where.priceMinor.gte = Math.round(query.minPrice * 100);
    if (query.maxPrice !== undefined) where.priceMinor.lte = Math.round(query.maxPrice * 100);
  }
  return where;
}

function buildOrderBy(sort) {
  if (!sort) return { createdAt: 'desc' };
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? 'desc' : 'asc' };
}

export async function list(tenantId, query) {
  const { page, limit, skip } = paginate(query);
  const where = buildWhere(tenantId, query);
  const orderBy = buildOrderBy(query.sort);

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { variants: true },
    }),
    prisma.product.count({ where }),
  ]);
  return paginatedResponse(await withFreshImageUrlsList(items), total, page, limit);
}

export async function getById(id, tenantId) {
  return findOwned(id, tenantId);
}

export async function create(tenantId, data) {
  const { stock = 0, variants = [], ...productData } = data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { tenantId, ...productData, stock },
    });
    await tx.inventory.create({
      data: { tenantId, productId: product.id, quantity: stock },
    });
    if (variants.length) {
      await tx.productVariant.createMany({
        data: variants.map((v) => ({ ...v, productId: product.id })),
      });
    }
    return withFreshImageUrls(
      await tx.product.findUnique({
        where: { id: product.id },
        include: { variants: true },
      }),
    );
  });
}

export async function update(id, tenantId, data) {
  await findOwned(id, tenantId);
  const { stock, variants, ...productData } = data;
  return prisma.$transaction(async (tx) => {
    await tx.product.update({
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

    if (variants !== undefined) {
      await tx.productVariant.deleteMany({ where: { productId: id } });
      if (variants.length) {
        await tx.productVariant.createMany({
          data: variants.map((v) => ({ ...v, productId: id })),
        });
      }
    }

    return withFreshImageUrls(
      await tx.product.findUnique({
        where: { id },
        include: { variants: true },
      }),
    );
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
  return withFreshImageUrls(product);
}

export async function uploadGalleryImage(id, tenantId, file) {
  await findOwned(id, tenantId);
  const asset = await uploadAsset({ tenantId, folder: 'product-gallery', file });
  const product = await prisma.product.findUnique({ where: { id } });
  const gallery = [...(product.galleryImages || []), { url: asset.url, storageKey: asset.storageKey }];
  const updated = await prisma.product.update({
    where: { id },
    data: { galleryImages: gallery },
  });
  return withFreshImageUrls(updated);
}

export async function removeGalleryImage(id, tenantId, storageKey) {
  await findOwned(id, tenantId);
  const product = await prisma.product.findUnique({ where: { id } });
  const gallery = (product.galleryImages || []).filter((img) => img.storageKey !== storageKey);
  return prisma.product.update({
    where: { id },
    data: { galleryImages: gallery },
  });
}

export function listCategories() {
  return PRODUCT_CATEGORIES;
}
