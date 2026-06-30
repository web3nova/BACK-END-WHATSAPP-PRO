import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { storage } from '../../config/storage.js';

export async function getProfile(tenantId) {
  const business = await prisma.business.findUnique({ where: { tenantId } });
  if (!business) throw new NotFoundError('Business profile not found.');
  return business;
}

export async function createProfile(tenantId, data) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (existing)
    throw new BadRequestError('Business profile already exists. Use PUT /business to update it.');
  return prisma.business.create({ data: { tenantId, ...data } });
}

export async function updateProfile(tenantId, data) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (!existing)
    throw new NotFoundError('Business profile not found. Create one first with POST /business.');
  return prisma.business.update({ where: { tenantId }, data });
}

export async function uploadLogo(tenantId, file) {
  const existing = await prisma.business.findUnique({ where: { tenantId } });
  if (!existing)
    throw new NotFoundError('Business profile not found. Create one first with POST /business.');

  const ext    = file.mimetype.split('/')[1];
  const key    = `logos/${tenantId}.${ext}`;
  await storage.put(key, file.buffer, file.mimetype);
  const logoUrl = await storage.getSignedUrl(key, 60 * 60 * 24 * 7); // 7-day signed URL

  await prisma.business.update({ where: { tenantId }, data: { logoUrl } });
  return { logoUrl };
}
