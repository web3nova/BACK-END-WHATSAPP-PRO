import { redis } from '../config/redis.js';
import { AppError } from '../common/errors/AppError.js';

/**
 * Per-tenant sliding-window rate limiter backed by Redis.
 * @param {object} opts
 * @param {number} opts.windowMs   - window length in ms (default 60 000)
 * @param {number} opts.max        - max requests per window per tenant (default 120)
 */
export const rateLimiter = ({ windowMs = 60_000, max = 120 } = {}) =>
  async (req, res, next) => {
    const tenantId = req.tenant?.id || req.headers['x-tenant-id'];
    if (!tenantId) return next(); // unauthenticated routes handle their own limiting

    const key = `rl:${tenantId}:${Math.floor(Date.now() / windowMs)}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

      if (count > max) {
        return next(new AppError('Too many requests — please slow down.', 429));
      }
    } catch {
      // Redis failure: fail open so a cache outage doesn't take down the API.
    }
    return next();
  };

export default rateLimiter;
