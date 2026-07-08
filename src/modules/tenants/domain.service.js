import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { BadRequestError, ConflictError } from '../../common/errors/index.js';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_API = 'https://api.vercel.com';

const DOMAIN_RE = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;

// Domains businesses must not use (they already point to Vercel project)
const RESERVED = ['biziq.online', 'www.biziq.online'];

async function vercelAddDomain(domain) {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    logger.warn('[domain] VERCEL_TOKEN or VERCEL_PROJECT_ID not set — skipping Vercel registration');
    return null;
  }
  const res = await fetch(`${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) {
    // 409 = domain already on this project, which is fine
    logger.error({ domain, status: res.status, error: json }, '[domain] Vercel add domain failed');
    throw new BadRequestError(`Could not register domain with Vercel: ${json?.error?.message || 'unknown error'}`);
  }
  return json;
}

async function vercelRemoveDomain(domain) {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return;
  const res = await fetch(`${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok && res.status !== 404) {
    const json = await res.json().catch(() => ({}));
    logger.warn({ domain, status: res.status, error: json }, '[domain] Vercel remove domain failed — continuing anyway');
  }
}

export async function setCustomDomain(tenantId, domain) {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!DOMAIN_RE.test(normalized)) {
    throw new BadRequestError('Invalid domain format. Use something like store.yourbusiness.com');
  }
  if (RESERVED.includes(normalized)) {
    throw new BadRequestError('That domain is reserved. Use your own domain.');
  }

  // Check uniqueness
  const conflict = await prisma.tenant.findUnique({ where: { domain: normalized } });
  if (conflict && conflict.id !== tenantId) {
    throw new ConflictError('That domain is already connected to another account.');
  }

  // Register with Vercel
  await vercelAddDomain(normalized);

  // Save to DB
  await prisma.tenant.update({ where: { id: tenantId }, data: { domain: normalized } });

  return {
    domain: normalized,
    cname: { type: 'CNAME', name: normalized, value: 'cname.vercel-dns.com' },
  };
}

export async function removeCustomDomain(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  if (!tenant?.domain) return;

  await vercelRemoveDomain(tenant.domain);
  await prisma.tenant.update({ where: { id: tenantId }, data: { domain: null } });
}
