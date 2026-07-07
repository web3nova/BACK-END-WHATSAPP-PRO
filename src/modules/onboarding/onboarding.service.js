import { prisma } from '../../config/prisma.js';

// Steps that reflect real, verifiable state and can't be forced.
// 'account' is always true if you've reached this endpoint at all.
export const OVERRIDABLE_STEPS = ['business', 'whatsapp', 'subscription'];

// The 'business' onboarding step is itself a multi-section profile (see
// saveBusinessProfile below): identity, compliance, operations, presence.
// Each section's completeness is derived live from the Business row's own
// columns (see computeBusinessPanelStatus) rather than a separate tracked
// flag, so it can never drift out of sync with what's actually saved.
export const BUSINESS_PANELS = ['identity', 'compliance', 'operations', 'presence'];

const BUSINESS_PANEL_SELECT = {
  id: true,
  displayName: true,
  phone: true,
  location: true,
  cacNumber: true,
  activeClients: true,
  staffCount: true,
  monthlyRevenue: true,
  deliveryStructure: true,
  availableDays: true,
};

function computeBusinessPanelStatus(business) {
  if (!business) {
    return { identity: false, compliance: false, operations: false, presence: false };
  }
  return {
    identity: !!(business.displayName && business.phone && business.location),
    compliance: true, // CAC and TIN are optional — never blocks onboarding completion
    operations:
      business.activeClients != null &&
      business.staffCount != null &&
      business.monthlyRevenue != null &&
      !!business.deliveryStructure,
    presence: Array.isArray(business.availableDays) && business.availableDays.length > 0,
  };
}

export async function getStatus(tenantId) {
  const [business, whatsapp, subscription, overrides] = await Promise.all([
    prisma.business.findUnique({ where: { tenantId }, select: BUSINESS_PANEL_SELECT }),
    prisma.whatsappAccount.findUnique({ where: { tenantId }, select: { verified: true } }),
    prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, trialEndsAt: true, renewsAt: true } }),
    prisma.onboardingOverride.findMany({ where: { tenantId }, select: { step: true } }),
  ]);

  const overriddenSteps = new Set(overrides.map((o) => o.step));
  const panelStatus = computeBusinessPanelStatus(business);
  const businessPanelsComplete = BUSINESS_PANELS.every((p) => panelStatus[p]);

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
 * Persist any subset of the business profile's fields (identity, compliance,
 * operations, presence all live on one dynamic form) in a single call. Only
 * the fields present in dbFields are touched — Prisma ignores undefined keys
 * on update, so a caller can send just `{ tin: '...' }` to edit one field
 * without resubmitting the rest of the profile.
 *
 * The very first call for a tenant must include the identity fields
 * (displayName, phone, location) since those are the only Business columns
 * that are required (non-nullable) at creation time. Every call after that
 * can touch any combination of fields from any section.
 *
 * rawInput (the pre-transform request body, UI field names) is kept in
 * OnboardingStepData purely as a debugging/audit trail — completion is
 * derived live from the Business row itself (see computeBusinessPanelStatus),
 * not from anything tracked here.
 */
export async function saveBusinessProfile(tenantId, dbFields, rawInput) {
  const existingBusiness = await prisma.business.findUnique({ where: { tenantId } });

  if (!existingBusiness) {
    const missing = ['displayName', 'phone', 'location'].filter((f) => dbFields[f] === undefined);
    if (missing.length) {
      const err = new Error(
        'Provide businessName, phoneNumber, and businessLocation to create your business profile before editing other sections.',
      );
      err.statusCode = 400;
      throw err;
    }
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

  const mergedData = { ...(existingStepData?.data ?? {}), ...rawInput };
  const panelStatus = computeBusinessPanelStatus(business);
  const panelsCompleted = BUSINESS_PANELS.filter((p) => panelStatus[p]);
  const allPanelsDone = panelsCompleted.length === BUSINESS_PANELS.length;

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

  return { business, panelsCompleted, allPanelsDone };
}

/**
 * Read-model for the business profile: the live Business row plus which
 * sections currently satisfy their required fields, so the frontend can
 * render section checkmarks without re-deriving completion itself.
 */
export async function getBusinessOnboarding(tenantId) {
  const business = await prisma.business.findUnique({ where: { tenantId } });
  const panelStatus = computeBusinessPanelStatus(business);
  const panelsCompleted = BUSINESS_PANELS.filter((p) => panelStatus[p]);

  return {
    business: business ?? null,
    panelsCompleted,
    allPanelsDone: panelsCompleted.length === BUSINESS_PANELS.length,
  };
}

/**
 * Submit the full onboarding business profile from the frontend wizard.
 * Wraps saveBusinessProfile while also persisting frontend-only fields
 * (countryIso2, locationState, locationCity) into the Business.settings JSON.
 */
export async function submitOnboarding(tenantId, dbFields, rawInput) {
  const extra = {};
  if (rawInput.countryIso2) extra.countryIso2 = rawInput.countryIso2;
  if (rawInput.locationState) extra.locationState = rawInput.locationState;
  if (rawInput.locationCity) extra.locationCity = rawInput.locationCity;

  if (Object.keys(extra).length > 0) {
    const existing = await prisma.business.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    dbFields.settings = { ...(existing?.settings ?? {}), ...extra };
  }

  return saveBusinessProfile(tenantId, dbFields, rawInput);
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