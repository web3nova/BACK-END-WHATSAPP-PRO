// In-memory SSE client registry. keyed by tenantId → Set of active res objects.
// No external dependency — lives as long as the process.
const clients = new Map();

export function addClient(tenantId, res) {
  if (!clients.has(tenantId)) clients.set(tenantId, new Set());
  clients.get(tenantId).add(res);
}

export function removeClient(tenantId, res) {
  const set = clients.get(tenantId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(tenantId);
}

/**
 * Push an SSE event to all connected clients for a tenant.
 * @param {string} tenantId
 * @param {'new_message'|'ai_message'|'conversation_updated'} event
 * @param {object} data
 */
export function pushEvent(tenantId, event, data) {
  const set = clients.get(tenantId);
  if (!set?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
      // compression middleware buffers writes — flush forces immediate delivery
      if (typeof res.flush === 'function') res.flush();
    } catch {
      set.delete(res);
    }
  }
}
