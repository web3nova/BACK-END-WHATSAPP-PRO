// src/middleware/tenant.middleware.js
import prisma from '../config/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../common/errors/index.js';

// Must run AFTER authMiddleware — relies on req.user being already set.
// Resolves req.user.tenantId into a full req.tenant object, and blocks
// access if the tenant has been suspended or cancelled.
export const tenantMiddleware = async (req, res, next) => {
  try {
    const { tenantId, isSuperAdmin } = req.user || {};

    // Platform super admins may operate with no tenant context at all.
    if (!tenantId) {
      if (isSuperAdmin) return next();
      return next(new UnauthorizedError('No tenant associated with this user'));
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      return next(new UnauthorizedError('Tenant not found'));
    }

    if (tenant.status !== 'ACTIVE') {
      return next(new ForbiddenError(`Tenant is ${tenant.status.toLowerCase()}`));
    }

    req.tenant = tenant;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default tenantMiddleware;