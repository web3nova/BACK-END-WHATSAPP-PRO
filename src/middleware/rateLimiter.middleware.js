import { redis } from '../config/redis.js';
import { AppError } from '../common/errors/AppError.js';

/**
 * Per-tenant sliding-window rate limiter backed by Redis.
 */
export const rateLimiter = ({ windowMs = 60_000, max = 120 } = {}) =>
  async (req, res, next) => {
    const tenantId = req.tenant?.id || req.headers['x-tenant-id'];
    if (!tenantId) return next();

    const key = `rl:${tenantId}:${Math.floor(Date.now() / windowMs)}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) return next(new AppError('Too many requests — please slow down.', 429));
    } catch {
      // Redis failure: fail open
    }
    return next();
  };

/**
 * IP-based rate limiter for public auth endpoints (login, OTP, forgot-password).
 * @param {object} opts
 * @param {number} opts.windowMs  - window length in ms (default 15 min)
 * @param {number} opts.max       - max requests per window per IP (default 5)
 * @param {string} opts.message   - error message shown to the user
 */
export const ipRateLimiter = ({ windowMs = 15 * 60_000, max = 5, message = 'Too many attempts — please try again later.' } = {}) =>
  async (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `rl:ip:${ip}:${req.path}:${Math.floor(Date.now() / windowMs)}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) {
        const retryAfter = Math.ceil(windowMs / 1000);
        res.setHeader('Retry-After', retryAfter);
        return next(new AppError(message, 429));
      }
    } catch {
      // Redis failure: fail open
    }
    return next();
  };

export default rateLimiter;
