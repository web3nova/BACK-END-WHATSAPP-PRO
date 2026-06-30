import prisma from '../../config/prisma.js';

export async function getStatus(tenantId) {
  const [business, whatsapp, subscription] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId }, select: { id: true } }),
    prisma.whatsappAccount.findUnique({ where: { tenantId }, select: { verified: true } }),
    prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, trialEndsAt: true, renewsAt: true } }),
  ]);

  const steps = {
    account:      true, // reaching this endpoint means tenant + user exist
    business:     !!business,
    whatsapp:     !!whatsapp?.verified,
    subscription: !!subscription && subscription.status !== 'CANCELLED',
  };

  const stepOrder = ['account', 'business', 'whatsapp', 'subscription'];
  const nextStep = stepOrder.find((s) => !steps[s]) ?? null;

  return {
    steps,
    nextStep,
    completed: nextStep === null,
    subscription: subscription ?? null,
  };
}
