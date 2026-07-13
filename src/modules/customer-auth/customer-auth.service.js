import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import { signAccessToken } from '../../common/utils/token.js';
import { logger } from '../../config/logger.js';

const SALT_ROUNDS = 10;

export async function signup({ tenantId, name, phone, email, password }) {
  if (!tenantId || !name || !password) {
    throw new BadRequestError('tenantId, name, and password are required');
  }
  if (!phone && !email) {
    throw new BadRequestError('Phone or email is required');
  }
  if (password.length < 6) {
    throw new BadRequestError('Password must be at least 6 characters');
  }

  if (phone) {
    const existing = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (existing) {
      throw new BadRequestError('An account with this phone number already exists. Please log in.');
    }
  }
  if (email) {
    const all = await prisma.customer.findMany({
      where: { tenantId },
      select: { meta: true },
    });
    if (all.some(c => c.meta?.email === email)) {
      throw new BadRequestError('An account with this email already exists. Please log in.');
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const phoneVal = phone || `email_${Date.now()}`;
  const customer = await prisma.customer.create({
    data: {
      tenantId,
      phone: phoneVal,
      name,
      meta: { passwordHash, email: email || null, signupVia: 'storefront' },
    },
  });

  const token = signAccessToken({
    sub: customer.id,
    tenantId: customer.tenantId,
    phone: customer.phone,
    role: 'customer',
  });

  return {
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    token,
  };
}

export async function login({ tenantId, phone, email, password }) {
  if (!tenantId || !password) {
    throw new BadRequestError('tenantId and password are required');
  }
  if (!phone && !email) {
    throw new BadRequestError('Phone or email is required');
  }

  let customer;
  if (phone) {
    customer = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
  } else {
    const all = await prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, name: true, phone: true, meta: true },
    });
    customer = all.find(c => c.meta?.email === email) || null;
  }

  if (!customer) {
    throw new UnauthorizedError(phone ? 'No account found with this phone number' : 'No account found with this email');
  }

  const storedHash = customer.meta?.passwordHash;
  if (!storedHash) {
    throw new UnauthorizedError('This account does not have a password set');
  }

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    throw new UnauthorizedError('Incorrect password');
  }

  const token = signAccessToken({
    sub: customer.id,
    tenantId: customer.tenantId,
    phone: customer.phone,
    role: 'customer',
  });

  return {
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.meta?.email || null },
    token,
  };
}

export async function googleLogin({ tenantId, idToken }) {
  if (!tenantId || !idToken) {
    throw new BadRequestError('tenantId and idToken are required');
  }

  // Verify the Google ID token using Google's tokeninfo endpoint
  let payload;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) throw new Error('Token verification failed');
    payload = await res.json();
  } catch (err) {
    logger.error({ err: err.message }, '[googleLogin] token verification failed');
    throw new UnauthorizedError('Invalid Google token');
  }

  if (!payload.email) {
    throw new BadRequestError('Google account must have an email');
  }

  const email = payload.email;
  const name = payload.name || email.split('@')[0];
  const picture = payload.picture || null;
  const googleId = payload.sub;

  // Find existing customer by email or googleId in meta
  let customer = await prisma.customer.findFirst({
    where: { tenantId, meta: { path: ['email'], equals: email } },
  });
  if (!customer) {
    customer = await prisma.customer.findFirst({
      where: { tenantId, meta: { path: ['googleId'], equals: googleId } },
    });
  }

  if (customer) {
    // Update existing customer's googleId and picture if not set
    const meta = { ...(customer.meta || {}), googleId, picture, email };
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { name: customer.name || name, meta },
    });
  } else {
    // Create a new customer with Google info
    const phone = `google_${googleId.slice(0, 12)}`;
    customer = await prisma.customer.create({
      data: {
        tenantId,
        phone,
        name,
        meta: { googleId, email, picture, signupVia: 'google' },
      },
    });
  }

  const token = signAccessToken({
    sub: customer.id,
    tenantId: customer.tenantId,
    phone: customer.phone,
    role: 'customer',
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.meta?.email || null,
      picture: customer.meta?.picture || null,
    },
    token,
  };
}

// ── Passkey (WebAuthn) support ──────────────────────────────────────

// Store challenges temporarily (in production, use Redis)
const pendingChallenges = new Map();

export async function passkeyRegisterStart({ tenantId, customerId }) {
  if (!tenantId || !customerId) {
    throw new BadRequestError('tenantId and customerId are required');
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  const userId = crypto.randomBytes(16).toString('base64url');

  pendingChallenges.set(`reg:${customerId}`, {
    challenge,
    userId,
    tenantId,
    createdAt: Date.now(),
  });

  // Clean up old challenges
  for (const [key, val] of pendingChallenges) {
    if (Date.now() - val.createdAt > 300000) pendingChallenges.delete(key);
  }

  return {
    challenge,
    userId,
    rpName: 'BizAI',
    rpId: typeof globalThis !== 'undefined' && globalThis.location
      ? globalThis.location.hostname
      : 'localhost',
  };
}

export async function passkeyRegisterComplete({ customerId, credential }) {
  if (!customerId || !credential) {
    throw new BadRequestError('customerId and credential are required');
  }

  const stored = pendingChallenges.get(`reg:${customerId}`);
  if (!stored) {
    throw new BadRequestError('Registration challenge expired. Please try again.');
  }

  // Store the credential in the customer's meta
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError('Customer not found');

  const meta = { ...(customer.meta || {}) };
  const passkeys = meta.passkeys || [];
  passkeys.push({
    id: credential.id,
    type: credential.type || 'public-key',
    rawId: credential.rawId || credential.id,
    response: credential.response,
    createdAt: new Date().toISOString(),
  });
  meta.passkeys = passkeys;

  await prisma.customer.update({
    where: { id: customerId },
    data: { meta },
  });

  pendingChallenges.delete(`reg:${customerId}`);

  return { success: true };
}

export async function passkeyLoginStart({ tenantId }) {
  if (!tenantId) throw new BadRequestError('tenantId is required');

  const challenge = crypto.randomBytes(32).toString('base64url');

  pendingChallenges.set(`auth:${tenantId}`, {
    challenge,
    tenantId,
    createdAt: Date.now(),
  });

  // Clean up old challenges
  for (const [key, val] of pendingChallenges) {
    if (Date.now() - val.createdAt > 300000) pendingChallenges.delete(key);
  }

  return {
    challenge,
    rpId: typeof globalThis !== 'undefined' && globalThis.location
      ? globalThis.location.hostname
      : 'localhost',
  };
}

export async function passkeyLoginComplete({ tenantId, credential }) {
  if (!tenantId || !credential) {
    throw new BadRequestError('tenantId and credential are required');
  }

  const stored = pendingChallenges.get(`auth:${tenantId}`);
  if (!stored) {
    throw new BadRequestError('Authentication challenge expired. Please try again.');
  }

  // Find customer with matching passkey credential
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true, meta: true },
  });

  let matchedCustomer = null;
  for (const c of customers) {
    const passkeys = c.meta?.passkeys || [];
    const match = passkeys.find(pk => pk.id === credential.id || pk.rawId === credential.rawId);
    if (match) {
      matchedCustomer = c;
      break;
    }
  }

  if (!matchedCustomer) {
    throw new UnauthorizedError('Passkey not found for this account');
  }

  pendingChallenges.delete(`auth:${tenantId}`);

  const token = signAccessToken({
    sub: matchedCustomer.id,
    tenantId: matchedCustomer.tenantId,
    phone: matchedCustomer.phone,
    role: 'customer',
  });

  return {
    customer: {
      id: matchedCustomer.id,
      name: matchedCustomer.name,
      phone: matchedCustomer.phone,
      email: matchedCustomer.meta?.email || null,
    },
    token,
  };
}

export async function getProfile(customerId, tenantId) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true, name: true, phone: true, meta: true, createdAt: true },
  });

  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.meta?.email || null,
    address: customer.meta?.address || null,
    createdAt: customer.createdAt,
  };
}
