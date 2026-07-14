import { config } from '../../config/index.js';
import { prisma } from '../../config/prisma.js';

// Single source of truth for "which browser origins may talk to this API" —
// used by BOTH the CORS middleware and passkey/WebAuthn origin validation.
// These two had drifted into separate lists (CORS read FRONTEND_URL + hardcoded
// entries; passkeys read a different ALLOWED_ORIGINS env var), so a passkey
// could be rejected from an origin CORS happily allowed. Unified here.

const STATIC_ORIGINS = [
  config.frontendUrl,
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:5174', // biziq-admin dev server
  'https://back-end-whatsapp-pro.onrender.com',
  'https://biziq-admin.vercel.app',
  'https://admin.biziq.online',
  // Anything explicitly configured via ALLOWED_ORIGINS is merged in, not
  // treated as a competing list.
  ...(config.auth.passkeyAllowedOrigins || []),
].filter(Boolean);

const STATIC_SET = new Set(STATIC_ORIGINS);

// Our own Vercel preview deployments, e.g. front-end-whatsapp-pro-git-x.vercel.app
const PREVIEW_PATTERNS = [
  /^https:\/\/biziq-admin(-[a-z0-9-]+)?\.vercel\.app$/,
  /^https:\/\/front-end-whatsapp-pro(-[a-z0-9-]+)?\.vercel\.app$/,
];

// Synchronous check against the fixed allowlist + preview patterns. Covers all
// platform traffic without a DB hit.
export function isStaticAllowedOrigin(origin) {
  if (!origin) return false;
  if (STATIC_SET.has(origin)) return true;
  return PREVIEW_PATTERNS.some((re) => re.test(origin));
}

// Full check: the static allowlist OR a merchant's own connected custom domain.
// The DB lookup only runs for origins not already whitelisted, so legitimate
// platform traffic never pays for it — only custom-domain storefronts (and, at
// worst, one indexed lookup before rejecting a bogus origin).
export async function isAllowedOrigin(origin) {
  if (isStaticAllowedOrigin(origin)) return true;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  try {
    const tenant = await prisma.tenant.findUnique({ where: { domain: host }, select: { id: true } });
    return !!tenant;
  } catch {
    return false;
  }
}
