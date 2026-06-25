import { ForbiddenError, UnauthorizedError } from '../common/errors/index.js';
import prisma from '../config/prisma.js';

// Usage on any route:  requirePermission('orders:write')
export const requirePermission = (permission) => async (req, res, next) => {
  try {
    const { user } = req;

    if (!user) return next(new UnauthorizedError('Not authenticated'));

    // Super admins bypass all permission checks
    if (user.isSuperAdmin) return next();

    if (!user.roleId) {
      return next(new ForbiddenError('No role assigned'));
    }

    const role = await prisma.role.findUnique({
      where: { id: user.roleId },
      select: { permissions: true },
    });

    if (!role) return next(new ForbiddenError('Role not found'));

    const permissions = Array.isArray(role.permissions) ? role.permissions : [];

    if (!permissions.includes(permission)) {
      return next(new ForbiddenError(`Missing permission: ${permission}`));
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export default requirePermission;