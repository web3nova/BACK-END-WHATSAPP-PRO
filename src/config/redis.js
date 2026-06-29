import IORedis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';

const url = config.redisUrl;

// Validate the URL format before handing it to ioredis.
// ioredis silently falls back to localhost:6379 when it can't parse the URL,
// which makes misconfigured deployments very hard to diagnose.
if (!url || (!url.startsWith('redis://') && !url.startsWith('rediss://'))) {
  throw new Error(
    `[redis] REDIS_URL must start with redis:// or rediss://. Got: "${url}". ` +
    `Check your Render environment variables — copy the full Upstash connection string (rediss://...).`
  );
}

// Mask credentials for safe logging
const maskedUrl = url.replace(/:([^@]+)@/, ':****@');
logger.info(`[redis] Connecting to ${maskedUrl}`);

// enableReadyCheck: false — Upstash doesn't expose server version info; disabling
// avoids the "Failed to obtain server version" warning storm on every connection.
// maxRetriesPerRequest: null — required by BullMQ (blocking commands have no per-request timeout).
// ioredis handles TLS automatically when the URL starts with rediss://.
export const redis = new IORedis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 30_000);
    if (times === 1) {
      logger.warn(
        `[redis] Cannot reach ${maskedUrl} — retrying in background every ${delay}ms. ` +
        `Rate-limiting and queues are unavailable until Redis is reachable.`
      );
    }
    return delay;
  },
});

redis.on('connect', () => logger.info(`[redis] Connected to ${maskedUrl}`));
redis.on('error', (err) => {
  // Only log unique error messages to avoid log spam on repeated ECONNREFUSED
  if (err.code === 'ECONNREFUSED') {
    logger.error(`[redis] Connection refused at ${maskedUrl} — is the Redis server reachable?`);
  }
});

export default redis;
