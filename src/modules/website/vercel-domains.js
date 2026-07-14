import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';

const BASE = 'https://api.vercel.com/v10/projects';

export async function addDomain(domain) {
  if (!config.vercelToken || !config.vercelProjectId) {
    logger.warn({ domain }, '[vercel-domains] VERCEL_TOKEN/VERCEL_PROJECT_ID not set — skipping Vercel attach');
    return { skipped: true };
  }
  const res = await fetch(`${BASE}/${config.vercelProjectId}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.vercelToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    logger.error({ domain, status: res.status, body }, '[vercel-domains] add domain failed');
    return { skipped: false, error: body?.error?.message || `HTTP ${res.status}` };
  }
  return { skipped: false };
}

export async function removeDomain(domain) {
  if (!config.vercelToken || !config.vercelProjectId) return { skipped: true };
  try {
    const res = await fetch(`${BASE}/${config.vercelProjectId}/domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.vercelToken}` },
    });
    if (!res.ok) logger.warn({ domain, status: res.status }, '[vercel-domains] remove domain non-OK (continuing)');
  } catch (err) {
    logger.warn({ domain, err: err.message }, '[vercel-domains] remove domain failed (continuing)');
  }
  return { skipped: false };
}
