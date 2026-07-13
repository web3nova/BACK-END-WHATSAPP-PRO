import { prisma } from '../../config/prisma.js';
import { encryptSecret, decryptSecret, maskSecret, SECRET_PLACEHOLDER } from '../../common/utils/encryption.js';

// Field paths (per provider) that hold real provider credentials and must
// never be stored or returned to the browser as plaintext.
const SECRET_FIELDS = {
  paystack: ['secretKey'],
  monnify: ['apiKey', 'secretKey'],
  blockradar: ['apiKey', 'secretKey'],
};

function defaultData() {
  return {
    manual: { isActive: false, bankAccount: null },
    paystack: { isActive: false, publicKey: '', secretKey: '' },
    monnify: { isActive: false, apiKey: '', secretKey: '', contractCode: '' },
    blockradar: { isActive: false, apiKey: '', secretKey: '', walletId: '', webhookUrl: '' },
    otherProviders: [],
    preferredProvider: 'manual',
  };
}

// Raw row as stored (secrets still encrypted) — used internally for merge-on-write.
export async function getConfig(tenantId) {
  const config = await prisma.paymentConfig.findUnique({ where: { tenantId } });
  if (!config) return { tenantId, data: defaultData() };
  return config;
}

// Decrypted config — for server-side use only (AI payment tools, checkout,
// storefront). Never pass this to a controller response.
export async function getDecryptedConfig(tenantId) {
  const config = await getConfig(tenantId);
  const data = structuredClone(config.data || defaultData());
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    if (!data[provider]) continue;
    for (const field of fields) {
      if (data[provider][field]) data[provider][field] = decryptSecret(data[provider][field]);
    }
  }
  for (const p of data.otherProviders || []) {
    if (p.secretKey) p.secretKey = decryptSecret(p.secretKey);
  }
  return { ...config, data };
}

// Masked config — safe to return to the frontend. Real secret values never
// leave the server; the client only ever sees a masked placeholder.
export async function getMaskedConfig(tenantId) {
  const config = await getDecryptedConfig(tenantId);
  const data = structuredClone(config.data);
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    if (!data[provider]) continue;
    for (const field of fields) {
      if (data[provider][field]) data[provider][field] = maskSecret(data[provider][field]);
    }
  }
  for (const p of data.otherProviders || []) {
    if (p.secretKey) p.secretKey = maskSecret(p.secretKey);
  }
  return { ...config, data };
}

export async function upsertConfig(tenantId, incoming) {
  const existingRaw = await getConfig(tenantId);

  const merged = {
    ...existingRaw.data,
    ...incoming,
    manual: { ...existingRaw.data?.manual, ...incoming.manual },
    paystack: { ...existingRaw.data?.paystack, ...incoming.paystack },
    monnify: { ...existingRaw.data?.monnify, ...incoming.monnify },
    blockradar: { ...existingRaw.data?.blockradar, ...incoming.blockradar },
  };
  if (incoming.otherProviders) merged.otherProviders = incoming.otherProviders;

  // Resolve each secret field: a masked placeholder means "keep what's already
  // stored" (re-encrypt the existing decrypted value); anything else is a real
  // new value from the client and gets freshly encrypted.
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    if (!merged[provider]) continue;
    for (const field of fields) {
      const incomingValue = incoming[provider]?.[field];
      if (incomingValue === SECRET_PLACEHOLDER || incomingValue === undefined) {
        merged[provider][field] = existingRaw.data?.[provider]?.[field] || '';
      } else {
        merged[provider][field] = encryptSecret(incomingValue);
      }
    }
  }
  merged.otherProviders = (merged.otherProviders || []).map((p, i) => {
    if (p.secretKey === SECRET_PLACEHOLDER || p.secretKey === undefined) {
      return { ...p, secretKey: existingRaw.data?.otherProviders?.[i]?.secretKey || '' };
    }
    return { ...p, secretKey: encryptSecret(p.secretKey) };
  });

  const saved = await prisma.paymentConfig.upsert({
    where: { tenantId },
    create: { tenantId, data: merged },
    update: { data: merged },
  });

  return getMaskedConfig(tenantId);
}
