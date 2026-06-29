import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';

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
