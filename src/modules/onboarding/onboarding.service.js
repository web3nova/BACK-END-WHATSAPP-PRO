import prisma from '../../config/prisma.js';

// Steps that reflect real, verifiable state and can't be forced.
// 'account' is always true if you've reached this endpoint at all.
export const OVERRIDABLE_STEPS = ['business', 'whatsapp', 'subscription'];

export async function getStatus(tenantId) {
  const [business, whatsapp, subscription, overrides] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId }, select: { id: true } }),
    prisma.whatsappAccount.findUnique({ where: { tenantId }, select: { verified: true } }),
    prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, trialEndsAt: true, renewsAt: true } }),
    prisma.onboardingOverride.findMany({ where: { tenantId }, select: { step: true } }),
  ]);

  const overriddenSteps = new Set(overrides.map((o) => o.step));

  const steps = {
    account:      true, // reaching this endpoint means tenant + user exist
    business:     !!business || overriddenSteps.has('business'),
    whatsapp:     !!whatsapp?.verified || overriddenSteps.has('whatsapp'),
    subscription: (!!subscription && subscription.status !== 'CANCELLED') || overriddenSteps.has('subscription'),
  };

  const stepOrder = ['account', 'business', 'whatsapp', 'subscription'];
  const nextStep = stepOrder.find((s) => !steps[s]) ?? null;

  return {
    steps,
    nextStep,
    completed: nextStep === null,
    subscription: subscription ?? null,
    overriddenSteps: [...overriddenSteps],
  };
}

/**
 * Admin override: force a specific onboarding step to "complete" for a tenant,
 * regardless of what the underlying data says (e.g. support waiving WhatsApp
 * verification for a VIP tenant). Only steps in OVERRIDABLE_STEPS are eligible —
 * 'account' can't be overridden because it's trivially always true.
 */
export async function markStepComplete(tenantId, step, adminUserId) {
  if (!OVERRIDABLE_STEPS.includes(step)) {
    const err = new Error(`Step "${step}" cannot be manually overridden. Allowed: ${OVERRIDABLE_STEPS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  await prisma.onboardingOverride.upsert({
    where: { tenantId_step: { tenantId, step } },
    update: { completedBy: adminUserId },
    create: { tenantId, step, completedBy: adminUserId },
  });

  return getStatus(tenantId);
}