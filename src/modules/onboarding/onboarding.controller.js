import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import { ForbiddenError } from '../../common/errors/index.js';
import prisma from '../../config/prisma.js';
import * as onboardingService from './onboarding.service.js';
import { stepParamSchema } from './onboarding.validation.js';

export const getStatus = asyncHandler(async (req, res) => {
  const data = await onboardingService.getStatus(getTenantId(req));
  return ok(res, data);
});

export const markStepComplete = asyncHandler(async (req, res) => {
  const { step } = stepParamSchema.parse(req.params);
  const { user } = req;

  // Allow super admins or users with onboarding:override permission
  if (!user.isSuperAdmin) {
    if (!user.roleId) {
      throw new ForbiddenError('Only super admins can override onboarding steps');
    }

    const role = await prisma.role.findUnique({
      where: { id: user.roleId },
      select: { permissions: true },
    });

    if (!role || !Array.isArray(role.permissions) || !role.permissions.includes('onboarding:override')) {
      throw new ForbiddenError('Missing permission: onboarding:override');
    }
  }

  const data = await onboardingService.markStepComplete(getTenantId(req), step, user.id);
  return ok(res, data);
});