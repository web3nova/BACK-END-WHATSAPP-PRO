import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { uploadAsset, proxyAssetUrl } from '../../common/utils/uploadAsset.js';
import { BUSINESS_CATEGORIES } from '../../common/constants/businessProfile.js';

// A raw signed URL (getAssetUrl) expires (~1hr) — fine for something
// rendered immediately, but the same logoUrl also ends up in places that
// outlive a single request (team-invite emails, a client-side PDF generated
// after the dashboard's been open a while). proxyAssetUrl never goes stale
// itself, so use it everywhere the logo is exposed.
async function withFreshLogoUrl(business) {
  if (!business?.logoStorageKey) return business;
  return {
    ...business,
    logoUrl: proxyAssetUrl('business-logos', business.logoStorageKey),
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

  // A logoUrl set here points at an asset outside the /business/logo
  // storage-key flow (e.g. picked from the media gallery or pasted).
  // Clear the old storageKey so withFreshLogoUrl doesn't regenerate a
  // signed URL to the previous upload and silently override this one.
  const payload = { ...data };
  if (payload.logoUrl !== undefined) {
    payload.logoStorageKey = null;
  }

  const business = await prisma.business.update({ where: { tenantId }, data: payload });
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
