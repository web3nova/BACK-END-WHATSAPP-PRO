import { redis } from '../../../config/redis.js';

// Short-term AI memory: normalized message history per conversation, in Redis.
const TTL_SECONDS = 60 * 60 * 24; // 24h sliding window
const MAX_MESSAGES = 40; // keep the loop bounded / token-safe

const key = (conversationId) => `ai:mem:${conversationId}`;

export async function load(conversationId) {
  const raw = await redis.get(key(conversationId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function save(conversationId, messages) {
  const trimmed = messages.slice(-MAX_MESSAGES);
  await redis.set(key(conversationId), JSON.stringify(trimmed), 'EX', TTL_SECONDS);
  return trimmed;
}

export async function clear(conversationId) {
  await redis.del(key(conversationId));
}

export default { load, save, clear };
