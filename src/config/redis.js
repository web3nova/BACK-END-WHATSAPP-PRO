import IORedis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';

// enableReadyCheck: false — Upstash doesn't expose server version info; disabling
// avoids the "Failed to obtain server version" warning storm on every connection.
// maxRetriesPerRequest: null — required by BullMQ (blocking commands have no per-request timeout).
// ioredis handles TLS automatically when the URL starts with rediss://.
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times === 1) {
      logger.warn(`[redis] Cannot reach ${config.redisUrl} — retrying in background. Rate-limiting and queues are unavailable until Redis is reachable.`);
    }
    return Math.min(times * 500, 30_000);
  },
});

redis.on('connect', () => logger.info('[redis] Connected'));

export default redis;
