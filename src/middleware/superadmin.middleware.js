import { ForbiddenError, UnauthorizedError } from '../common/errors/index.js';

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user) return next(new UnauthorizedError('Not authenticated'));

  if (!req.user.isSuperAdmin) {
    return next(new ForbiddenError('Super admin access required'));
  }

  return next();
};

export default requireSuperAdmin;