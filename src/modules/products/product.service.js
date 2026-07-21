import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';
import { uploadAsset } from '../../common/utils/uploadAsset.js';
import { PRODUCT_CATEGORIES } from '../../common/constants/businessProfile.js';
import { getChatProvider } from '../ai/providers/index.js';
import { parseCSV } from '../catalog/catalog.service.js';

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

const CSV_HEADER_ALIASES = {
  name: ['name', 'product', 'product name', 'title'],
  price: ['price', 'amount', 'unit price'],
  priceMinor: ['priceminor', 'price minor', 'price (minor)'],
  stock: ['stock', 'quantity', 'qty', 'inventory'],
  category: ['category', 'type'],
  description: ['description', 'desc', 'details'],
  brand: ['brand', 'manufacturer'],
  sku: ['sku', 'code', 'product code'],
};

// Case/whitespace-insensitive header lookup — merchants export CSVs from all
// sorts of tools (Excel, Google Sheets, other platforms), so "Price", "price",
// and " Price " should all resolve the same column, not silently miss it.
function readField(row, field) {
  const aliases = CSV_HEADER_ALIASES[field];
  for (const key of Object.keys(row)) {
    if (aliases.includes(key.trim().toLowerCase())) {
      const value = row[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  }
  return undefined;
}

// Bulk-imports real Product rows from a CSV — reuses catalog.service.js's
// parser but creates actual products (via the same create() used by the
// one-at-a-time form) instead of the separate, disconnected JSONB Catalog
// table that nothing else in the app reads from. Best-effort: one bad row
// doesn't abort the whole import, it's just skipped and reported.
export async function importFromCSV(tenantId, buffer) {
  const rows = parseCSV(buffer);
  const result = { created: 0, skipped: [] };

  for (const [i, row] of rows.entries()) {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const name = readField(row, 'name');
    if (!name) {
      result.skipped.push({ row: rowNumber, reason: 'Missing product name' });
      continue;
    }

    const priceMinorRaw = readField(row, 'priceMinor');
    const priceRaw = readField(row, 'price');
    let priceMinor;
    if (priceMinorRaw !== undefined) {
      priceMinor = Number.parseInt(priceMinorRaw, 10);
    } else if (priceRaw !== undefined) {
      priceMinor = Math.round(Number.parseFloat(priceRaw) * 100);
    }
    if (!Number.isFinite(priceMinor) || priceMinor < 0) {
      result.skipped.push({ row: rowNumber, reason: `Missing or invalid price for "${name}"` });
      continue;
    }

    const stock = Math.max(0, Number.parseInt(readField(row, 'stock'), 10) || 0);
    const categoryRaw = (readField(row, 'category') || '').toLowerCase().replace(/\s+/g, '-');
    const category = PRODUCT_CATEGORIES.includes(categoryRaw) ? categoryRaw : 'regular';

    try {
      await create(tenantId, {
        name,
        priceMinor,
        stock,
        category,
        description: readField(row, 'description'),
        brand: readField(row, 'brand'),
        sku: readField(row, 'sku'),
        trackStock: stock > 0,
      });
      result.created += 1;
    } catch (err) {
      result.skipped.push({ row: rowNumber, reason: err.message || 'Could not create product' });
    }
  }

  return result;
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

// AI-assisted product listing: given just a name (what a merchant would
// naturally type first), fill in the tedious-but-optional fields — the
// description, browse tags, a guessed brand, spec sheet, and selling-point
// features — so a product entry is close to complete after one click instead
// of the merchant typing all of it by hand. Deliberately does NOT suggest a
// price: the AI has no idea what this merchant actually charges, and a wrong
// hallucinated number silently accepted into a catalog is worse than an
// empty field.
export async function suggestDetails({ name, brand, category }) {
  if (!name || !name.trim()) throw new BadRequestError('Product name is required to generate suggestions.');

  const system = `You write complete, sales-ready e-commerce product listings for WhatsApp-first businesses in Nigeria. Given a product name (and optionally a brand/category), respond with ONLY a JSON object, no markdown, no commentary, matching this exact shape:
{
  "description": "3-4 sentence sales-friendly description covering what it is, who it's for, and why it's worth buying",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "brand": "manufacturer/brand name if identifiable from the product name, else empty string",
  "specifications": [{"key": "Spec name", "value": "Spec value"}],
  "features": [{"title": "Short feature name", "description": "One sentence on why it matters"}]
}
Rules:
- description: under 600 characters, no markdown formatting, written to actually sell the product, not just describe it.
- tags: exactly 5, short, lowercase, realistic search/browse keywords a buyer would type.
- specifications: 3 to 6 entries, genuinely plausible for this exact product type (e.g. a phone gets storage/RAM/screen size, a garment gets material/size range) — do not pad with generic filler like "Quality: High".
- features: 2 to 4 entries, each a concrete selling point, not a restatement of the description.
- If you are not confident about a specific spec value, omit that spec entirely rather than guessing a fake number.`;

  const userLines = [`Product name: ${name.trim()}`];
  if (brand) userLines.push(`Brand: ${brand.trim()}`);
  if (category) userLines.push(`Category: ${category.trim()}`);

  const provider = getChatProvider();
  const result = await provider.chat({
    system,
    messages: [{ role: 'user', content: userLines.join('\n') }],
    tools: [],
    maxTokens: 1024,
  });

  const raw = result?.text || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new BadRequestError('AI suggestion failed — please write the details manually.');

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new BadRequestError('AI suggestion failed — please write the details manually.');
  }

  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

  return {
    description: typeof parsed.description === 'string' ? parsed.description.slice(0, 600) : '',
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === 'string').slice(0, 5) : [],
    brand: typeof parsed.brand === 'string' ? parsed.brand.trim().slice(0, 100) : '',
    specifications: Array.isArray(parsed.specifications)
      ? parsed.specifications
        .filter((s) => isPlainObject(s) && typeof s.key === 'string' && typeof s.value === 'string')
        .map((s) => ({ key: s.key.slice(0, 100), value: s.value.slice(0, 500) }))
        .slice(0, 6)
      : [],
    features: Array.isArray(parsed.features)
      ? parsed.features
        .filter((f) => isPlainObject(f) && typeof f.title === 'string' && typeof f.description === 'string')
        .map((f) => ({ title: f.title.slice(0, 200), description: f.description.slice(0, 2000) }))
        .slice(0, 4)
      : [],
  };
}

// Public, trimmed subset for social-preview cards — no auth, no tenant
// context, so the tenant is resolved through the product itself. Mirrors how
// getStorefront strips secrets for its public payload.
export async function getProductOg(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      name: true,
      description: true,
      priceMinor: true,
      imageUrl: true,
      imageStorageKey: true,
      tenant: { select: { slug: true, business: { select: { displayName: true } } } },
    },
  });
  if (!product) throw new NotFoundError('Product not found.');
  const { imageUrl } = withFreshImageUrl({ imageUrl: product.imageUrl, imageStorageKey: product.imageStorageKey });
  return {
    name: product.name,
    description: product.description || '',
    priceMinor: product.priceMinor,
    currency: 'NGN',
    imageUrl,
    business: { displayName: product.tenant?.business?.displayName || '', slug: product.tenant?.slug || '' },
  };
}
