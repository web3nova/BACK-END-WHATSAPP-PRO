// src/middleware/auth.middleware.js
import { UnauthorizedError } from '../common/errors/index.js';
import { verifyAccessToken } from '../common/utils/token.js';

export const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    // payload shape set at sign time in auth.service.js: { sub, tenantId, isSuperAdmin, roleId }
    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      isSuperAdmin: payload.isSuperAdmin,
      roleId: payload.roleId,
    };
    return next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};

export default authMiddleware;