import { Router } from 'express';
import {
  getStatus,
  getStepData,
  saveStepData,
  getProgress,
  markStepComplete,
  saveBusinessProfile,
  getBusinessOnboarding,
} from './onboarding.controller.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';

const router = Router();

/**
 * @openapi
 * /onboarding/status:
 *   get:
 *     summary: Get onboarding completion status for the current tenant
 *     description: Returns which onboarding steps are complete and the next pending step.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     steps:
 *                       type: object
 *                       properties:
 *                         account:      { type: boolean }
 *                         business:     { type: boolean }
 *                         whatsapp:     { type: boolean }
 *                         subscription: { type: boolean }
 *                     nextStep:
 *                       type: string
 *                       nullable: true
 *                       example: business
 *                     completed:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       nullable: true
 */
router.get('/status', getStatus);

/**
 * @openapi
 * /onboarding/steps/{step}:
 *   get:
 *     summary: Get saved draft form data for an onboarding step
 *     description: Returns whatever data was last saved for this step, so the frontend can resume a wizard the user left partway through.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: step
 *         required: true
 *         schema:
 *           type: string
 *           enum: [business, whatsapp, subscription]
 *     responses:
 *       200:
 *         description: Saved step data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     step:        { type: string }
 *                     data:        { type: object }
 *                     startedAt:   { type: string, format: date-time, nullable: true }
 *                     completedAt: { type: string, format: date-time, nullable: true }
 *                     updatedAt:   { type: string, format: date-time, nullable: true }
 *       400:
 *         description: Unknown step
 *   put:
 *     summary: Save draft form data for an onboarding step
 *     description: >
 *       Upserts the form data for a step and records it as the tenant's current
 *       step for progress tracking. Pass ?complete=true once the step's data
 *       is final rather than a mid-wizard draft.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: step
 *         required: true
 *         schema:
 *           type: string
 *           enum: [business, whatsapp, subscription]
 *       - in: query
 *         name: complete
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Mark this step's data as final (sets completedAt)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 type: object
 *                 description: Arbitrary form data for this step, at least one field
 *     responses:
 *       200:
 *         description: Saved step data
 *       400:
 *         description: Unknown step or empty data
 */
router.get('/steps/:step', getStepData);
router.put('/steps/:step', saveStepData);

/**
 * @openapi
 * /onboarding/progress:
 *   get:
 *     summary: Full onboarding picture for the current tenant
 *     description: Derived completion status plus progress-tracking metadata (currentStep, startedAt, lastActiveAt) and every step's saved form data. Useful for a dashboard or analytics view in one call.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full onboarding progress
 */
router.get('/progress', getProgress);

/**
 * @openapi
 * /onboarding/business:
 *   get:
 *     summary: Read the business profile's current state
 *     description: Returns the live Business row (or null if it hasn't been created yet) plus which of the 4 sections (identity, compliance, operations, presence) currently satisfy their required fields, so the frontend can render section checkmarks without re-deriving them.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     business: { type: object, nullable: true }
 *                     panelsCompleted:
 *                       type: array
 *                       items: { type: string, enum: [identity, compliance, operations, presence] }
 *                     allPanelsDone: { type: boolean }
 *   put:
 *     summary: Update the business profile — any section, any subset of fields, in one call
 *     description: >
 *       A single dynamic endpoint covering every field across all 4 onboarding
 *       screens (identity, compliance, operations, presence & hours). Send
 *       just the field(s) you want to change — e.g. `{ "tin": "..." }` to
 *       edit only the TIN — and only those columns are touched.
 *
 *       The very first call for a tenant must include `businessName`,
 *       `phoneNumber`, and `businessLocation` together, since those are the
 *       only fields required to create the Business row. Every call after
 *       that can touch any combination of fields from any section, in any
 *       order, as many or as few at a time as the caller wants.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one field is required. All fields are optional individually.
 *             properties:
 *               businessName: { type: string, example: "Ada's Fashion House" }
 *               phoneNumber: { type: string, example: '+2348012345678' }
 *               businessLocation: { type: string, example: 'Ikeja, Lagos' }
 *               cacRegistrationNumber: { type: string, example: 'RC 1124322' }
 *               tin: { type: string, example: '1234567-0001' }
 *               numberOfActiveClients: { type: integer, example: 244 }
 *               numberOfStaff: { type: integer, example: 22 }
 *               averageMonthlyRevenue: { type: integer, example: 2524555, description: 'Naira' }
 *               deliveryStructure: { type: string, enum: [self, third-party, pickup, mixed] }
 *               instagram: { type: string, example: '@yourbusiness' }
 *               twitter: { type: string, example: '@yourbusiness' }
 *               facebookPage: { type: string, example: 'facebook.com/yourbusiness' }
 *               tiktok: { type: string, example: '@yourbusiness' }
 *               daysAvailable:
 *                 type: array
 *                 items: { type: string, enum: [Mon, Tue, Wed, Thu, Fri, Sat, Sun] }
 *               openingTime: { type: string, example: '08:00', description: 'HH:MM, 24-hour' }
 *               closingTime: { type: string, example: '18:00', description: 'HH:MM, 24-hour' }
 *     responses:
 *       200:
 *         description: Saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     business: { type: object }
 *                     panelsCompleted:
 *                       type: array
 *                       items: { type: string, enum: [identity, compliance, operations, presence] }
 *                     allPanelsDone: { type: boolean }
 *       400:
 *         description: Validation error, empty body, or the profile doesn't exist yet and identity fields weren't provided
 */
router.get('/business', getBusinessOnboarding);
router.put('/business', saveBusinessProfile);

/**
 * @openapi
 * /onboarding/steps/{step}/complete:
 *   post:
 *     summary: Manually mark an onboarding step complete (admin override)
 *     description: >
 *       Forces a specific onboarding step to a completed state for the current
 *       tenant, regardless of the underlying data (e.g. support waiving WhatsApp
 *       verification). Requires the 'onboarding:override' permission (super admins
 *       bypass this automatically). The 'account' step cannot be overridden since
 *       it is trivially always true.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: step
 *         required: true
 *         schema:
 *           type: string
 *           enum: [business, whatsapp, subscription]
 *         description: The onboarding step to mark complete
 *     responses:
 *       200:
 *         description: Updated onboarding status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     steps:
 *                       type: object
 *                       properties:
 *                         account:      { type: boolean }
 *                         business:     { type: boolean }
 *                         whatsapp:     { type: boolean }
 *                         subscription: { type: boolean }
 *                     nextStep:
 *                       type: string
 *                       nullable: true
 *                     completed:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *                     overriddenSteps:
 *                       type: array
 *                       items: { type: string }
 *       400:
 *         description: Invalid or non-overridable step
 *       403:
 *         description: Caller lacks the 'onboarding:override' permission
 */
router.post('/steps/:step/complete', requirePermission('onboarding:override'), markStepComplete);

export default router;