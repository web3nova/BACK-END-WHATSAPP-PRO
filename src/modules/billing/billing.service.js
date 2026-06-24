import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { getPlanLimits } from '../../common/constants/plans.js';

export const getSubscription = async (tenantId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (!subscription) {
    // Auto-create free plan if none exists
    return prisma.subscription.create({
      data: { tenantId, plan: 'free', status: 'active' },
    });
  }

  return subscription;
};

export const createSubscription = async (tenantId, { plan }) => {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (existing) throw new BadRequestError('Subscription already exists — use update instead');

  return prisma.subscription.create({
    data: { tenantId, plan, status: 'active' },
  });
};

export const updateSubscription = async (tenantId, { plan, status, renewsAt }) => {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!existing) throw new NotFoundError('No subscription found for this tenant');

  return prisma.subscription.update({
    where: { tenantId },
    data: {
      ...(plan     !== undefined ? { plan }     : {}),
      ...(status   !== undefined ? { status }   : {}),
      ...(renewsAt !== undefined ? { renewsAt } : {}),
    },
  });
};

export const cancelSubscription = async (tenantId) => {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!existing) throw new NotFoundError('No subscription found');
  if (existing.status === 'cancelled') {
    throw new BadRequestError('Subscription is already cancelled');
  }

  return prisma.subscription.update({
    where: { tenantId },
    data: { status: 'cancelled' },
  });
};

export const getLimits = async (tenantId) => {
  const subscription = await getSubscription(tenantId);
  return {
    plan:   subscription.plan,
    status: subscription.status,
    limits: getPlanLimits(subscription.plan),
  };
};

export default {
  getSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getLimits,
};