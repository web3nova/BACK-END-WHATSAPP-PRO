import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { getAssetUrl, uploadAsset } from '../../common/utils/uploadAsset.js';
import { BUSINESS_CATEGORIES } from '../../common/constants/businessProfile.js';

async function withFreshLogoUrl(business) {
  if (!business?.logoStorageKey) return business;
  return {
    ...business,
    logoUrl: await getAssetUrl(business.logoStorageKey, business.logoUrl),
  };
}

export async function getProfile(tenantId) {
  const [business, tenant] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true, slug: true } }),
  ]);
  if (!business) return null;
  const fresh = await withFreshLogoUrl(business);
  return { ...fresh, domain: tenant?.domain ?? null, slug: tenant?.slug ?? null };
}

export async function createProfile(tenantId, data) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (existing) {
    return prisma.business.update({ where: { tenantId }, data });
  }
  return prisma.business.create({ data: { tenantId, ...data } });
}

export async function updateProfile(tenantId, data) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (!existing)
    throw new NotFoundError('Business profile not found. Create one first with POST /business.');
  const business = await prisma.business.update({ where: { tenantId }, data });
  return withFreshLogoUrl(business);
}

export async function uploadLogo(tenantId, file) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (!existing)
    throw new NotFoundError('Business profile not found. Create one first with POST /business.');

  const asset = await uploadAsset({ tenantId, folder: 'business-logos', file });
  const business = await prisma.business.update({
    where: { tenantId },
    data: {
      logoUrl: asset.url,
      logoStorageKey: asset.storageKey,
    },
  });
  return withFreshLogoUrl(business);
}

export function listCategories() {
  return BUSINESS_CATEGORIES;
}
