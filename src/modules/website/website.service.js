import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

function normalizeHost(host = '') {
  const normalized = host.split(':')[0]?.toLowerCase();
  return normalized && !['localhost', '127.0.0.1', '0.0.0.0'].includes(normalized)
    ? normalized
    : undefined;
}

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
  published: false,
};

async function resolveStorefrontTenant(req) {
  const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
  const slug = req.query.slug;
  const domain =
    req.query.domain || normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);

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

export async function updateSettings(tenantId, data) {
  const business = await requireBusiness(tenantId);
  return prisma.websiteSettings.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id, ...defaultSettings, ...data },
    update: data,
  });
}

// Public storefront: tenant + business info + published pages + in-stock products.
export async function getStorefront(req) {
  const tenant = await resolveStorefrontTenant(req);
  const business = await requireBusiness(tenant.id);
  const [settings, pages, products] = await Promise.all([
    prisma.websiteSettings.findUnique({
      where: { businessId: business.id },
      select: { theme: true, navigation: true, seo: true, social: true, published: true },
    }),
    prisma.websitePage.findMany({
      where: { businessId: business.id, published: true },
      orderBy: { slug: 'asc' },
      select: { slug: true, title: true, content: true },
    }),
    prisma.product.findMany({
      where: { tenantId: tenant.id, stock: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        priceMinor: true,
        currency: true,
        attributes: true,
      },
    }),
  ]);
  return {
    tenant,
    business: {
      displayName: business.displayName,
      description: business.description,
      logoUrl: business.logoUrl,
    },
    settings: settings ?? defaultSettings,
    pages,
    products,
  };
}
