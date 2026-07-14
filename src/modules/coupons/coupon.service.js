import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors/index.js';

async function findOwned(id, tenantId) {
  const coupon = await prisma.coupon.findFirst({ where: { id, tenantId } });
  if (!coupon) throw new NotFoundError('Coupon not found.');
  return coupon;
}

export async function listCoupons(tenantId) {
  return prisma.coupon.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createCoupon(tenantId, data) {
  const { code, ...rest } = data;
  try {
    return await prisma.coupon.create({
      data: { tenantId, code: code.toUpperCase(), ...rest },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new BadRequestError('Code already in use');
    }
    throw err;
  }
}

export async function updateCoupon(tenantId, id, data) {
  const existing = await findOwned(id, tenantId);
  const { code, ...rest } = data;
  const updateData = code !== undefined ? { ...rest, code: code.toUpperCase() } : rest;

  // The percent-cap check in validation only fires when `type` is resent in
  // the same request — a partial update (e.g. `{ value }` alone) must still
  // be checked against the coupon's EXISTING type, or the 1-100 cap is
  // bypassable by omitting `type` from the PATCH body.
  const effectiveType = updateData.type ?? existing.type;
  const effectiveValue = updateData.value ?? existing.value;
  if (effectiveType === 'percent' && effectiveValue > 100) {
    throw new BadRequestError('Percent value must be between 1 and 100');
  }

  try {
    return await prisma.coupon.update({
      where: { id },
      data: updateData,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new BadRequestError('Code already in use');
    }
    throw err;
  }
}

export async function deleteCoupon(tenantId, id) {
  await findOwned(id, tenantId);
  await prisma.coupon.delete({ where: { id } });
}
