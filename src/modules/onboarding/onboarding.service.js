import { prisma } from '../../config/prisma.js';

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
 * Fetch the saved draft form data for a single step, so the frontend can
 * resume a wizard the user abandoned partway through.
 */
export async function getStepData(tenantId, step) {
  if (!OVERRIDABLE_STEPS.includes(step)) {
    const err = new Error(`Unknown step "${step}"`);
    err.statusCode = 400;
    throw err;
  }

  const record = await prisma.onboardingStepData.findUnique({
    where: { tenantId_step: { tenantId, step } },
  });

  return record ?? { tenantId, step, data: {}, startedAt: null, completedAt: null, updatedAt: null };
}

/**
 * Save (upsert) the form data for a step, and bump the tenant's overall
 * onboarding progress pointer (currentStep, lastActiveAt) for drop-off tracking.
 * Pass { complete: true } once the step's data is final, not just a draft save.
 *
 * IMPORTANT: `data` is merged (shallow) into whatever was previously saved for
 * this step, not overwritten. The "business" step in particular is fed by a
 * multi-panel wizard (identity -> compliance -> operations -> presence/hours)
 * that calls this once per panel with only that panel's fields. A plain
 * overwrite would wipe out earlier panels' data on every subsequent save.
 * Shallow merge is sufficient here because each panel contributes a disjoint
 * set of top-level field names (e.g. businessName vs cacRegistrationNumber vs
 * numberOfActiveClients) — none of them share or nest into the same key.
 * If a future panel introduces nested/array fields that need deep merging,
 * swap the spread below for a deep-merge helper (e.g. lodash.merge).
 */
export async function saveStepData(tenantId, step, data, { complete = false } = {}) {
  if (!OVERRIDABLE_STEPS.includes(step)) {
    const err = new Error(`Unknown step "${step}"`);
    err.statusCode = 400;
    throw err;
  }

  // Ensure the parent progress row exists (FK requirement) and record that
  // this tenant is now actively working on `step`.
  await prisma.onboardingProgress.upsert({
    where: { tenantId },
    update: { currentStep: step },
    create: { tenantId, currentStep: step },
  });

  const existing = await prisma.onboardingStepData.findUnique({
    where: { tenantId_step: { tenantId, step } },
    select: { data: true },
  });

  const mergedData = { ...(existing?.data ?? {}), ...data };

  return prisma.onboardingStepData.upsert({
    where: { tenantId_step: { tenantId, step } },
    update: {
      data: mergedData,
      ...(complete ? { completedAt: new Date() } : {}),
    },
    create: {
      tenantId,
      step,
      data: mergedData,
      completedAt: complete ? new Date() : null,
    },
  });
}

/**
 * The full onboarding picture for a tenant: derived completion status
 * (same as getStatus), plus progress-tracking metadata and every step's
 * saved form data. Useful for a single dashboard call or for analytics.
 */
export async function getProgress(tenantId) {
  const [status, progress, stepData] = await Promise.all([
    getStatus(tenantId),
    prisma.onboardingProgress.findUnique({ where: { tenantId } }),
    prisma.onboardingStepData.findMany({ where: { tenantId } }),
  ]);

  return {
    ...status,
    currentStep: progress?.currentStep ?? null,
    startedAt: progress?.startedAt ?? null,
    lastActiveAt: progress?.lastActiveAt ?? null,
    stepData: Object.fromEntries(
      stepData.map((s) => [
        s.step,
        { data: s.data, startedAt: s.startedAt, completedAt: s.completedAt, updatedAt: s.updatedAt },
      ]),
    ),
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