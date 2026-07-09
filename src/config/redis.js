import IORedis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';
import { setInterval } from 'node:timers';

const url = config.redisUrl;

if (!url || (!url.startsWith('redis://') && !url.startsWith('rediss://'))) {
  throw new Error(
    `[redis] REDIS_URL must start with redis:// or rediss://. ` +
    `Check your Render environment variables — copy the full Upstash connection string (rediss://...).`
  );
}

const maskedUrl = url.replace(/:([^@]+)@/, ':****@');
logger.info(`[redis] Connecting to ${maskedUrl}`);

function makeErrorHandler(label) {
  return (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') return;
    logger.error(`[redis] ${label} error (${err.code || err.name}) — ${err.message?.replace(url, maskedUrl)}`);
  };
}

// ─── Worker connection ────────────────────────────────────────────────────────
// maxRetriesPerRequest: null — retries indefinitely so the worker never gives up
// waiting for a job (BullMQ docs requirement for Worker instances).
export const redis = new IORedis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 15_000,
  commandTimeout: 30_000,
  keepAlive: 8_000,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 30_000);
    if (times === 1) logger.warn(`[redis] Cannot reach ${maskedUrl} — retrying`);
    return delay;
  },
});

let _workerConnected = false;
redis.on('connect', () => {
  if (!_workerConnected) { logger.info(`[redis] Worker connection ready`); _workerConnected = true; }
});
redis.on('close', () => { _workerConnected = false; });
redis.on('error', makeErrorHandler('Worker'));

// App-level heartbeat — keeps the worker connection alive past Upstash's idle timeout
setInterval(() => { redis.ping().catch(() => {}); }, 10_000).unref();

// BullMQ calls redis.duplicate() for its internal blocking connections.
// Patch to propagate our error handler onto every duplicate.
const _origDuplicate = redis.duplicate.bind(redis);
redis.duplicate = (...args) => {
  const dup = _origDuplicate(...args);
  dup.on('error', makeErrorHandler('Worker/dup'));
  return dup;
};

// ─── Queue connection ─────────────────────────────────────────────────────────
// maxRetriesPerRequest: 1 — queue.add() fails fast (< 500 ms) when Redis is
// unavailable so our in-process fallback kicks in immediately instead of hanging.
// BullMQ docs: "Queue instances should use a low maxRetriesPerRequest so callers
// can get an error quickly and retry later."
export const redisForQueue = new IORedis(url, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  connectTimeout: 15_000,
  commandTimeout: 5_000,
  keepAlive: 8_000,
  retryStrategy(times) {
    return Math.min(times * 500, 30_000);
  },
});

redisForQueue.on('error', makeErrorHandler('Queue'));

// ─── Global safety net ────────────────────────────────────────────────────────
// Catches ECONNRESET/EPIPE that slip past EventEmitter error handlers (e.g.
// BullMQ internals before our listeners attach). Silences them; anything else
// re-throws so real crashes still surface.
process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') return;
  throw err;
});

export default redis;
