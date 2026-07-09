import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { BadRequestError } from '../../common/errors/index.js';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_API = 'https://api.vercel.com';

const DOMAIN_RE = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;

// Common second-level public suffixes — a domain like shop.com.ng is an apex,
// not a subdomain of com.ng.
const SECOND_LEVEL_SUFFIXES = new Set([
  'com.ng', 'org.ng', 'net.ng', 'gov.ng', 'edu.ng', 'co.uk', 'org.uk', 'ac.uk',
  'com.gh', 'co.ke', 'co.za', 'com.eg', 'co.tz', 'co.ug',
]);

/** True when the domain is a root/apex domain (no subdomain part). */
function isApexDomain(domain) {
  const parts = domain.split('.');
  if (parts.length === 2) return true;
  if (parts.length === 3 && SECOND_LEVEL_SUFFIXES.has(parts.slice(1).join('.'))) return true;
  return false;
}

/**
 * DNS records the business must create. Apex domains cannot take a CNAME —
 * they need an A record pointing at Vercel's anycast IP.
 */
function dnsInstructionsFor(domain) {
  if (isApexDomain(domain)) {
    return [
      { type: 'A', name: '@', value: '76.76.21.21', note: `Point ${domain} to Vercel` },
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', note: `Optional: also serve www.${domain}` },
    ];
  }
  const sub = domain.split('.')[0];
  return [
    { type: 'CNAME', name: sub, value: 'cname.vercel-dns.com', note: `Point ${domain} to Vercel` },
  ];
}

function requireVercelConfig() {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    throw new BadRequestError('Custom domains are not enabled on this deployment. Contact support.');
  }
}

async function vercelFetch(path, options = {}) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function vercelAddDomain(domain) {
  const { res, json } = await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  });

  if (res.status === 409) {
    // Domain already exists on Vercel — confirm it's attached to OUR project
    const check = await vercelFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`);
    if (!check.res.ok) {
      throw new BadRequestError(
        'This domain is registered to another Vercel project. Remove it there first, or contact support.'
      );
    }
    return check.json;
  }

  if (!res.ok) {
    logger.error({ domain, status: res.status, error: json }, '[domain] Vercel add domain failed');
    throw new BadRequestError(`Could not register domain: ${json?.error?.message || 'unknown error'}`);
  }

  return json;
}

async function vercelRemoveDomain(domain) {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return;
  const { res, json } = await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    logger.warn({ domain, status: res.status, error: json }, '[domain] Vercel remove domain failed — continuing anyway');
  }
}

/**
 * Live status of the tenant's custom domain:
 * - verified: Vercel has confirmed domain ownership (TXT challenge passed or not needed)
 * - misconfigured: DNS does not point at Vercel yet
 * - verification: TXT/CNAME challenge records the business must add (when ownership is contested)
 */
export async function getDomainStatus(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  if (!tenant?.domain) return { domain: null };
  const domain = tenant.domain;

  const base = { domain, dns: dnsInstructionsFor(domain) };
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return { ...base, verified: null, misconfigured: null, live: null };

  const [info, config] = await Promise.all([
    vercelFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`),
    vercelFetch(`/v6/domains/${domain}/config`),
  ]);

  const verified = info.res.ok ? info.json.verified === true : false;
  const verification = info.res.ok ? (info.json.verification || []) : [];
  const misconfigured = config.res.ok ? config.json.misconfigured === true : true;

  return {
    ...base,
    verified,
    misconfigured,
    live: verified && !misconfigured,
    verification: verification.map((v) => ({ type: v.type, name: v.domain, value: v.value })),
  };
}

export async function setCustomDomain(tenantId, domain) {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!DOMAIN_RE.test(normalized)) {
    throw new BadRequestError('Invalid domain format. Use something like store.yourbusiness.com');
  }
  // Block the platform domain and every subdomain of it
  if (normalized === 'biziq.online' || normalized.endsWith('.biziq.online')) {
    throw new BadRequestError('That domain is reserved. Use your own domain.');
  }

  const conflict = await prisma.tenant.findUnique({ where: { domain: normalized } });
  if (conflict && conflict.id !== tenantId) {
    throw new BadRequestError('That domain is already connected to another account.');
  }

  requireVercelConfig();
  const added = await vercelAddDomain(normalized);

  await prisma.tenant.update({ where: { id: tenantId }, data: { domain: normalized } });

  return {
    domain: normalized,
    dns: dnsInstructionsFor(normalized),
    verified: added?.verified === true,
    verification: (added?.verification || []).map((v) => ({ type: v.type, name: v.domain, value: v.value })),
  };
}

export async function removeCustomDomain(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  if (!tenant?.domain) return;

  await vercelRemoveDomain(tenant.domain);
  await prisma.tenant.update({ where: { id: tenantId }, data: { domain: null } });
}
