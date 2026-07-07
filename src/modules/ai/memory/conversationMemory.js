import { redis } from '../../../config/redis.js';

// Short-term AI memory: normalized message history per conversation, in Redis.
const TTL_SECONDS = 60 * 60 * 24; // 24h sliding window
const MAX_MESSAGES = 40; // keep the loop bounded / token-safe

const key = (conversationId) => `ai:mem:${conversationId}`;

const REDIS_TIMEOUT_MS = 3000;

function withRedisTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), REDIS_TIMEOUT_MS)),
  ]);
}

export async function load(conversationId) {
  try {
    const raw = await withRedisTimeout(redis.get(key(conversationId)));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return []; // Redis down or slow — start with empty history
  }
}

export async function save(conversationId, messages) {
  const trimmed = messages.slice(-MAX_MESSAGES);
  try {
    await withRedisTimeout(redis.set(key(conversationId), JSON.stringify(trimmed), 'EX', TTL_SECONDS));
  } catch {
    // non-fatal — memory just won't persist this turn
  }
  return trimmed;
}

export async function clear(conversationId) {
  await redis.del(key(conversationId));
}

export default { load, save, clear };
