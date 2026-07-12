import { UnauthorizedError } from '../common/errors/index.js';
import { verifyAccessToken } from '../common/utils/token.js';

export const customerAuthMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'customer') {
      return next(new UnauthorizedError('Invalid token type'));
    }
    req.customer = {
      id: payload.sub,
      tenantId: payload.tenantId,
      phone: payload.phone,
    };
    return next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};

export default customerAuthMiddleware;
