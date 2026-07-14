// Pure helpers for custom-domain ownership verification. No I/O here — DNS
// lookups and the Vercel API call live elsewhere (website.service.js / vercel-domains.js).

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const d = domain.trim().toLowerCase();
  if (d.length > 253) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return false;
  return HOSTNAME_RE.test(d);
}

export function matchesVerifyToken(txtRecords, token) {
  if (!Array.isArray(txtRecords) || !token) return false;
  return txtRecords.some((rec) => Array.isArray(rec) && rec.join('').trim() === token);
}
