import IORedis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';
import { setInterval } from 'node:timers';

const url = config.redisUrl;

// Validate the URL format before handing it to ioredis.
// ioredis silently falls back to localhost:6379 when it can't parse the URL,
// which makes misconfigured deployments very hard to diagnose.
if (!url || (!url.startsWith('redis://') && !url.startsWith('rediss://'))) {
  throw new Error(
    `[redis] REDIS_URL must start with redis:// or rediss://. ` +
    `Check your Render environment variables — copy the full Upstash connection string (rediss://...).`
  );
}

// Mask credentials for safe logging
const maskedUrl = url.replace(/:([^@]+)@/, ':****@');
logger.info(`[redis] Connecting to ${maskedUrl}`);

// enableReadyCheck: false — Upstash doesn't expose server version info; disabling
// avoids the "Failed to obtain server version" warning storm on every connection.
// maxRetriesPerRequest: null — required by BullMQ (blocking commands have no per-request timeout).
// keepAlive: 10_000 — sends a TCP keepalive probe every 10s so the OS/Upstash doesn't
// silently drop the socket during idle periods. Without this, Upstash closes idle
// connections and ioredis only notices via ECONNRESET, causing a reconnect loop.
// ioredis handles TLS automatically when the URL starts with rediss://.
export const redis = new IORedis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  keepAlive: 10_000,
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
  logger.error(`[redis] Error (${err.code || err.name}) at ${maskedUrl} — ${err.message?.replace(url, maskedUrl)}`);
});

// Fallback heartbeat: some Upstash plans enforce a hard idle timeout regardless of
// TCP-level keepalive. A lightweight app-level PING every 30s keeps the connection
// demonstrably "active" from Upstash's perspective. Safe to remove if keepAlive alone
// resolves the reconnect loop in your logs.
const HEARTBEAT_INTERVAL_MS = 30_000;
setInterval(() => {
  redis.ping().catch((err) => {
    logger.warn(`[redis] Heartbeat ping failed (${err.code || err.name}) — ${err.message}`);
  });
}, HEARTBEAT_INTERVAL_MS).unref();

export default redis;