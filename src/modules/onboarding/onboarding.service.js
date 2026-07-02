import { prisma } from '../../config/prisma.js';

// Steps that reflect real, verifiable state and can't be forced.
// 'account' is always true if you've reached this endpoint at all.
export const OVERRIDABLE_STEPS = ['business', 'whatsapp', 'subscription'];

// The 'business' onboarding step is itself a 4-panel wizard (see
// saveBusinessPanel below). It only counts as complete once every panel has
// been submitted at least once, not merely once a Business row exists.
export const BUSINESS_PANELS = ['identity', 'compliance', 'operations', 'presence'];

export async function getStatus(tenantId) {
  const [business, whatsapp, subscription, overrides, businessStep] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId }, select: { id: true } }),
    prisma.whatsappAccount.findUnique({ where: { tenantId }, select: { verified: true } }),
    prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, trialEndsAt: true, renewsAt: true } }),
    prisma.onboardingOverride.findMany({ where: { tenantId }, select: { step: true } }),
    prisma.onboardingStepData.findUnique({
      where: { tenantId_step: { tenantId, step: 'business' } },
      select: { data: true },
    }),
  ]);

  const overriddenSteps = new Set(overrides.map((o) => o.step));
  const completedPanels = new Set(businessStep?.data?.completedPanels ?? []);
  const businessPanelsComplete = BUSINESS_PANELS.every((p) => completedPanels.has(p));

  const steps = {
    account:      true, // reaching this endpoint means tenant + user exist
    business:     (!!business && businessPanelsComplete) || overriddenSteps.has('business'),
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
 * Persist one panel of the business onboarding wizard (identity, compliance,
 * operations, presence). Unlike saveStepData, this writes straight into the
 * real Business row (via dbFields, already mapped from UI field names to
 * Prisma columns by the panel's zod schema) so the record is usable
 * everywhere else in the app immediately, not just parked in a JSON draft.
 *
 * The 'identity' panel is the only one allowed to create the Business row,
 * since it carries the fields Business requires at creation (displayName,
 * phone, location). Later panels assume identity has already run.
 *
 * rawInput (the pre-transform request body, UI field names) is additionally
 * kept in OnboardingStepData under the panel's own key so the wizard can be
 * resumed with the exact values the user typed, and so admins can see the
 * raw submission history per panel, not just the current Business row state.
 */
export async function saveBusinessPanel(tenantId, panel, dbFields, rawInput) {
  if (!BUSINESS_PANELS.includes(panel)) {
    const err = new Error(`Unknown business panel "${panel}". Allowed: ${BUSINESS_PANELS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const existingBusiness = await prisma.business.findUnique({ where: { tenantId } });

  if (panel !== 'identity' && !existingBusiness) {
    const err = new Error('Complete the business identity panel first.');
    err.statusCode = 400;
    throw err;
  }

  const business = existingBusiness
    ? await prisma.business.update({ where: { tenantId }, data: dbFields })
    : await prisma.business.create({ data: { tenantId, ...dbFields } });

  await prisma.onboardingProgress.upsert({
    where: { tenantId },
    update: { currentStep: 'business' },
    create: { tenantId, currentStep: 'business' },
  });

  const existingStepData = await prisma.onboardingStepData.findUnique({
    where: { tenantId_step: { tenantId, step: 'business' } },
    select: { data: true },
  });

  const prevData = existingStepData?.data ?? {};
  const completedPanels = new Set(prevData.completedPanels ?? []);
  completedPanels.add(panel);
  const allPanelsDone = BUSINESS_PANELS.every((p) => completedPanels.has(p));

  const mergedData = {
    ...prevData,
    [panel]: rawInput,
    completedPanels: [...completedPanels],
  };

  await prisma.onboardingStepData.upsert({
    where: { tenantId_step: { tenantId, step: 'business' } },
    update: {
      data: mergedData,
      ...(allPanelsDone ? { completedAt: new Date() } : {}),
    },
    create: {
      tenantId,
      step: 'business',
      data: mergedData,
      completedAt: allPanelsDone ? new Date() : null,
    },
  });

  return { business, panelsCompleted: [...completedPanels], allPanelsDone };
}

/**
 * Read-model for the business wizard: the live Business row plus which
 * panels have been submitted, so the frontend can render step checkmarks
 * without re-deriving completion from raw field presence.
 */
export async function getBusinessOnboarding(tenantId) {
  const [business, stepData] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId } }),
    prisma.onboardingStepData.findUnique({
      where: { tenantId_step: { tenantId, step: 'business' } },
      select: { data: true },
    }),
  ]);

  const completedPanels = stepData?.data?.completedPanels ?? [];

  return {
    business: business ?? null,
    panelsCompleted: completedPanels,
    allPanelsDone: BUSINESS_PANELS.every((p) => completedPanels.includes(p)),
  };
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