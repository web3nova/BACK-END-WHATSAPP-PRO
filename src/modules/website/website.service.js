import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';
import { getAssetUrl, uploadAsset, deleteAsset } from '../../common/utils/uploadAsset.js';
import { logger } from '../../config/logger.js';


async function requireBusiness(tenantId) {
  const business = await prisma.business.findUnique({ where: { tenantId } });
  if (!business) {
    throw new NotFoundError('Business profile not found. Create one first with POST /business.');
  }
  return business;
}

async function requirePage(businessId, slug) {
  const page = await prisma.websitePage.findUnique({
    where: { businessId_slug: { businessId, slug } },
  });
  if (!page) throw new NotFoundError(`Page "${slug}" not found.`);
  return page;
}

const defaultSettings = {
  theme: {},
  navigation: [],
  seo: {},
  social: {},
  sections: [],
  published: false,
};

async function resolveStorefrontTenant({ tenantId, slug, domain }) {
  const where = tenantId ? { id: tenantId } : slug ? { slug } : domain ? { domain } : null;

  if (!where) {
    throw new BadRequestError('Provide tenantId, slug, or domain to load a storefront.');
  }

  const tenant = await prisma.tenant.findFirst({
    where: { ...where, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, domain: true },
  });

  if (!tenant) throw new NotFoundError('Storefront not found.');
  return tenant;
}

export async function listPages(tenantId, query) {
  const business = await requireBusiness(tenantId);
  const { page, limit, skip } = paginate(query);
  const where = { businessId: business.id };
  const [items, total] = await Promise.all([
    prisma.websitePage.findMany({ where, skip, take: limit, orderBy: { slug: 'asc' } }),
    prisma.websitePage.count({ where }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

export async function createPage(tenantId, data) {
  const business = await requireBusiness(tenantId);
  const existing = await prisma.websitePage.findUnique({
    where: { businessId_slug: { businessId: business.id, slug: data.slug } },
  });
  if (existing) throw new BadRequestError(`A page with slug "${data.slug}" already exists.`);
  return prisma.websitePage.create({ data: { businessId: business.id, ...data } });
}

export async function getPage(tenantId, slug) {
  const business = await requireBusiness(tenantId);
  return requirePage(business.id, slug);
}

export async function updatePage(tenantId, slug, data) {
  const business = await requireBusiness(tenantId);
  await requirePage(business.id, slug);
  return prisma.websitePage.update({
    where: { businessId_slug: { businessId: business.id, slug } },
    data,
  });
}

export async function deletePage(tenantId, slug) {
  const business = await requireBusiness(tenantId);
  await requirePage(business.id, slug);
  await prisma.websitePage.delete({
    where: { businessId_slug: { businessId: business.id, slug } },
  });
}

export async function setPublished(tenantId, slug, published) {
  const business = await requireBusiness(tenantId);
  await requirePage(business.id, slug);
  return prisma.websitePage.update({
    where: { businessId_slug: { businessId: business.id, slug } },
    data: { published },
  });
}

export async function getSettings(tenantId) {
  const business = await requireBusiness(tenantId);
  return prisma.websiteSettings.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id, ...defaultSettings },
    update: {},
  });
}

export async function uploadImage(tenantId, file) {
  const business = await requireBusiness(tenantId);
  const asset = await uploadAsset({ tenantId, folder: 'website-images', file });
  await prisma.websiteMedia.create({
    data: { businessId: business.id, storageKey: asset.storageKey, mimeType: asset.mimeType, size: asset.size },
  });
  return { url: asset.url, storageKey: asset.storageKey };
}

export async function deleteImage(tenantId, storageKey) {
  await requireBusiness(tenantId);
  if (!storageKey.startsWith(`website-images/${tenantId}/`)) {
    throw new ForbiddenError('Cannot delete an asset outside your own tenant.');
  }
  await deleteAsset(storageKey);
  await prisma.websiteMedia.deleteMany({ where: { storageKey } });
}

// Media library: everything this business has ever uploaded via uploadImage,
// newest first. R2 URLs are signed and time-limited, so only storageKey is
// persisted — a fresh URL is signed on every read, never stored long-lived.
export async function listMedia(tenantId, query) {
  const business = await requireBusiness(tenantId);
  const { page, limit, skip } = paginate(query);
  const where = { businessId: business.id };
  const [items, total] = await Promise.all([
    prisma.websiteMedia.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.websiteMedia.count({ where }),
  ]);
  const signed = await Promise.all(items.map(async (m) => ({
    id: m.id,
    url: await getAssetUrl(m.storageKey),
    storageKey: m.storageKey,
    mimeType: m.mimeType,
    size: m.size,
    createdAt: m.createdAt,
  })));
  return paginatedResponse(signed, total, page, limit);
}

export async function deleteMedia(tenantId, id) {
  const business = await requireBusiness(tenantId);
  const media = await prisma.websiteMedia.findUnique({ where: { id } });
  if (!media || media.businessId !== business.id) {
    throw new NotFoundError('Media not found.');
  }
  await deleteAsset(media.storageKey);
  await prisma.websiteMedia.delete({ where: { id } });
}

const MAX_REVISIONS_PER_BUSINESS = 20;

export async function updateSettings(tenantId, data) {
  const business = await requireBusiness(tenantId);

  // Snapshot what settings looked like *before* this change, so it can be
  // restored later. Nothing to snapshot on the very first save (no prior
  // state exists yet). Best-effort: revision history is a convenience
  // feature, not core to saving settings — a failure here (e.g. the
  // revisions table being briefly unavailable) must never block the actual
  // save the user is waiting on.
  try {
    const existing = await prisma.websiteSettings.findUnique({ where: { businessId: business.id } });
    if (existing) {
      const { id, businessId, updatedAt, ...snapshot } = existing;
      await prisma.websiteSettingsRevision.create({ data: { businessId: business.id, snapshot } });

      const overflow = await prisma.websiteSettingsRevision.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: 'desc' },
        skip: MAX_REVISIONS_PER_BUSINESS,
        select: { id: true },
      });
      if (overflow.length) {
        await prisma.websiteSettingsRevision.deleteMany({ where: { id: { in: overflow.map((r) => r.id) } } });
      }
    }
  } catch (err) {
    logger.warn({ tenantId, err: err.message }, '[website] Failed to snapshot settings revision — continuing with save');
  }

  return prisma.websiteSettings.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id, ...defaultSettings, ...data },
    update: data,
  });
}

export async function listRevisions(tenantId, query) {
  const business = await requireBusiness(tenantId);
  const { page, limit, skip } = paginate(query);
  const where = { businessId: business.id };
  const [items, total] = await Promise.all([
    prisma.websiteSettingsRevision.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.websiteSettingsRevision.count({ where }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

// Restoring goes through updateSettings() itself, so the current
// (pre-restore) state gets snapshotted as a new revision too — a restore is
// always itself undoable, same as any other save.
export async function restoreRevision(tenantId, id) {
  const business = await requireBusiness(tenantId);
  const revision = await prisma.websiteSettingsRevision.findUnique({ where: { id } });
  if (!revision || revision.businessId !== business.id) {
    throw new NotFoundError('Revision not found.');
  }
  return updateSettings(tenantId, revision.snapshot);
}

// Public storefront: tenant + business info + published pages + in-stock products.
// Accepts a plain { tenantId, slug, domain } object — no req dependency.
export async function getStorefront({ tenantId, slug, domain }) {
  const tenant = await resolveStorefrontTenant({ tenantId, slug, domain });
  const business = await requireBusiness(tenant.id);
  const [settings, pages, products] = await Promise.all([
    prisma.websiteSettings.findUnique({
      where: { businessId: business.id },
      select: { theme: true, navigation: true, seo: true, social: true, sections: true, published: true },
    }),
    prisma.websitePage.findMany({
      where: { businessId: business.id, published: true },
      orderBy: { slug: 'asc' },
      select: { slug: true, title: true, content: true },
    }),
    // Out-of-stock products are still shown (the storefront already renders
    // a "Sold Out" badge + disables ordering for stock <= 0) — excluding
    // them here would also hide brand-new products, since stock defaults to
    // 0 until the owner sets it. isActive is the real visibility gate.
    prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        review: true,
        imageUrl: true,
        imageStorageKey: true,
        priceMinor: true,
        currency: true,
        attributes: true,
        stock: true,
      },
    }),
  ]);
  if (!settings?.published) {
    throw new NotFoundError('Storefront not found. The business may not be published yet.');
  }
  return {
    tenant,
    business: {
      displayName: business.displayName,
      category: business.category,
      categoryOther: business.categoryOther,
      tagline: business.tagline,
      description: business.description,
      email: business.email,
      whatsappNumber: business.whatsappNumber,
      logoUrl: business.logoStorageKey
        ? await getAssetUrl(business.logoStorageKey, business.logoUrl)
        : business.logoUrl,
    },
    settings: settings ?? defaultSettings,
    pages,
    products: await Promise.all(
      products.map(async ({ imageStorageKey, ...product }) => ({
        ...product,
        imageUrl: imageStorageKey
          ? await getAssetUrl(imageStorageKey, product.imageUrl)
          : product.imageUrl,
      })),
    ),
  };
}

// Classify a storefront visit into one of the 4 buckets the Analytics page
// shows, from the Referer header — no cookies/fingerprinting, just an
// aggregate count. Caller (the controller) never awaits this — a logging
// failure must never affect or slow down the actual storefront response.
export async function recordVisit({ tenantId, referrer, host }) {
  let source = 'direct';
  if (referrer) {
    const ref = referrer.toLowerCase();
    if (ref.includes('whatsapp') || ref.includes('wa.me')) {
      source = 'whatsapp';
    } else if (host && ref.includes(host.toLowerCase())) {
      source = 'website';
    } else {
      source = 'referral';
    }
  }
  await prisma.websiteVisit.create({ data: { tenantId, source, referrer: referrer || null } });
}
