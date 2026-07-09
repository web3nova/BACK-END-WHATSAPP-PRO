import { AppError } from '../common/errors/AppError.js';

// In-process fixed-window rate limiting. The app runs as a single instance
// (Render, WEB_CONCURRENCY=1), so no shared store is needed.
const counters = new Map(); // key → count

// Sweep stale windows so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (entry.resetAt <= now) counters.delete(key);
  }
}, 60 * 1000).unref();

function hit(key, windowMs) {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || entry.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Per-tenant fixed-window rate limiter.
 */
export const rateLimiter = ({ windowMs = 60_000, max = 120 } = {}) =>
  (req, res, next) => {
    const tenantId = req.tenant?.id || req.headers['x-tenant-id'];
    if (!tenantId) return next();

    const count = hit(`rl:${tenantId}`, windowMs);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    if (count > max) return next(new AppError('Too many requests — please slow down.', 429));
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
  (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return next();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const count = hit(`rl:ip:${ip}:${req.path}`, windowMs);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    if (count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return next(new AppError(message, 429));
    }
    return next();
  };

export default rateLimiter;
