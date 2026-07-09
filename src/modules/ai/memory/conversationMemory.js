// Short-term AI memory: normalized message history per conversation, in-process.
// The app runs as a single instance (Render, WEB_CONCURRENCY=1), so an in-memory
// Map is sufficient — no external store needed. Entries expire after 24h.
const TTL_MS = 60 * 60 * 24 * 1000; // 24h sliding window
const MAX_MESSAGES = 40; // keep the loop bounded / token-safe

const store = new Map(); // conversationId → { messages, expiresAt }

// Periodically sweep expired entries so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}, 10 * 60 * 1000).unref();

export async function load(conversationId) {
  const entry = store.get(conversationId);
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(conversationId);
    return [];
  }
  return entry.messages;
}

export async function save(conversationId, messages) {
  const trimmed = messages.slice(-MAX_MESSAGES);
  store.set(conversationId, { messages: trimmed, expiresAt: Date.now() + TTL_MS });
  return trimmed;
}

export async function clear(conversationId) {
  store.delete(conversationId);
}

export default { load, save, clear };
