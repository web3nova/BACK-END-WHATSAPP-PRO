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

const maskedUrl = url.replace(/:([^@]+)@/, ':****@');
logger.info(`[redis] Connecting to ${maskedUrl}`);

let _connected = false;

export const redis = new IORedis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // TCP keepalive every 8s — beats Upstash free-tier's ~20s idle timeout
  keepAlive: 8_000,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 30_000);
    if (times === 1) {
      logger.warn(`[redis] Cannot reach ${maskedUrl} — retrying every ${delay}ms`);
    }
    return delay;
  },
});

redis.on('connect', () => {
  if (!_connected) {
    logger.info(`[redis] Connected to ${maskedUrl}`);
    _connected = true;
  }
  // reconnects are silent — noise at INFO level every 30s serves no purpose
});
redis.on('close', () => { _connected = false; });
redis.on('error', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') return;
  logger.error(`[redis] Error (${err.code || err.name}) — ${err.message?.replace(url, maskedUrl)}`);
});

// App-level heartbeat at 10s — keeps connection alive if TCP keepalive alone isn't enough
setInterval(() => {
  redis.ping().catch(() => { /* reconnect handled by ioredis */ });
}, 10_000).unref();

// BullMQ calls redis.duplicate() for its internal blocking connections.
// Duplicated instances inherit options but NOT event listeners, so ECONNRESET would
// print as raw unhandled errors. Patch duplicate() to propagate our error handler.
const _origDuplicate = redis.duplicate.bind(redis);
redis.duplicate = (...args) => {
  const dup = _origDuplicate(...args);
  dup.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') return;
    logger.error(`[redis] Error on internal connection (${err.code || err.name}) — ${err.message?.replace(url, maskedUrl)}`);
  });
  return dup;
};

// Global safety net — catches any Redis/ioredis ECONNRESET that slips through
// without an error listener (e.g. from BullMQ internals). Without this,
// Node.js prints the raw error to stderr and may crash.
process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') return;
  throw err;
});

export default redis;