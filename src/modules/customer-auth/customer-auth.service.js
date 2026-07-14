import bcrypt from 'bcrypt';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import { signAccessToken } from '../../common/utils/token.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import { isAllowedOrigin } from '../../common/utils/allowedOrigins.js';
import { validateGoogleTokenPayload } from './google-token.js';

const SALT_ROUNDS = 10;

// Signups with no phone (Google OAuth, or email/password without one) get a
// synthetic placeholder stored in the (required, unique) phone column so
// login/lookups still work internally — it must never reach the frontend as
// if it were a real phone (it was showing up in the account menu and
// pre-filling the checkout form's phone input with garbage like "google_...").
const isSyntheticPhone = (phone) => typeof phone === 'string' && (phone.startsWith('google_') || phone.startsWith('email_'));
const publicPhone = (phone) => (isSyntheticPhone(phone) ? null : phone);

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
      source: 'website',
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
    customer: { id: customer.id, name: customer.name, phone: publicPhone(customer.phone) },
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
    customer: { id: customer.id, name: customer.name, phone: publicPhone(customer.phone), email: customer.meta?.email || null },
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

  validateGoogleTokenPayload(payload, config.auth.googleClientId);

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
        source: 'google',
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
      phone: publicPhone(customer.phone),
      email: customer.meta?.email || null,
      picture: customer.meta?.picture || null,
    },
    token,
  };
}

// ── Passkey (WebAuthn) support ──────────────────────────────────────

// In-memory challenge store. Fine for a single Render instance; move to Redis
// if the backend ever scales horizontally.
const pendingChallenges = new Map();
const CHALLENGE_TTL_MS = 300000;

function putChallenge(key, value) {
  pendingChallenges.set(key, { ...value, createdAt: Date.now() });
  for (const [k, v] of pendingChallenges) {
    if (Date.now() - v.createdAt > CHALLENGE_TTL_MS) pendingChallenges.delete(k);
  }
}

function takeChallenge(key) {
  const stored = pendingChallenges.get(key);
  pendingChallenges.delete(key);
  if (!stored || Date.now() - stored.createdAt > CHALLENGE_TTL_MS) return null;
  return stored;
}

// WebAuthn's RP ID must be exactly the domain the browser is actually on — a
// credential registered under one domain cannot verify against another. This
// app serves the storefront from multiple domains at once (biziq.online, a
// Vercel preview URL, and per-tenant custom domains), so a single static RP_ID
// env var can never be correct for all of them. Instead, derive it per-request
// from the browser's actual Origin header, validated against the SAME shared
// allowlist CORS uses (including tenant custom domains) — and store the
// resolved value alongside the challenge so the *complete* call verifies
// against the exact origin/RP ID used at *start*.
async function resolveOrigin(originHeader) {
  if (!originHeader || !(await isAllowedOrigin(originHeader))) {
    throw new BadRequestError('Passkeys are not supported from this origin.');
  }
  return originHeader;
}

function rpIdFromOrigin(origin) {
  return new URL(origin).hostname;
}

export async function passkeyRegisterStart({ tenantId, customerId, origin }) {
  if (!tenantId || !customerId) {
    throw new BadRequestError('tenantId and customerId are required');
  }
  const resolvedOrigin = await resolveOrigin(origin);
  const rpID = rpIdFromOrigin(resolvedOrigin);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError('Customer not found');

  const existing = (customer.meta?.passkeys || []).map(pk => ({ id: pk.id }));

  const options = await generateRegistrationOptions({
    rpName: 'BizIQ',
    rpID,
    userName: customer.meta?.email || customer.phone,
    userDisplayName: customer.name || customer.phone,
    attestationType: 'none',
    excludeCredentials: existing,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  putChallenge(`reg:${customerId}`, { challenge: options.challenge, tenantId, rpID, origin: resolvedOrigin });
  return options;
}

export async function passkeyRegisterComplete({ customerId, credential }) {
  if (!customerId || !credential) {
    throw new BadRequestError('customerId and credential are required');
  }

  const stored = takeChallenge(`reg:${customerId}`);
  if (!stored) {
    throw new BadRequestError('Registration challenge expired. Please try again.');
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError('Customer not found');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: stored.origin,
      expectedRPID: stored.rpID,
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[passkey] registration verification failed');
    throw new BadRequestError('Passkey registration could not be verified');
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new BadRequestError('Passkey registration could not be verified');
  }

  const { credential: cred } = verification.registrationInfo;
  const meta = { ...(customer.meta || {}) };
  const passkeys = (meta.passkeys || []).filter(pk => pk.id !== cred.id);
  passkeys.push({
    id: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString('base64url'),
    counter: cred.counter,
    transports: cred.transports || [],
    createdAt: new Date().toISOString(),
  });
  meta.passkeys = passkeys;

  await prisma.customer.update({ where: { id: customerId }, data: { meta } });
  return { success: true };
}

export async function passkeyLoginStart({ tenantId, origin }) {
  if (!tenantId) throw new BadRequestError('tenantId is required');
  const resolvedOrigin = await resolveOrigin(origin);
  const rpID = rpIdFromOrigin(resolvedOrigin);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: [],
  });

  putChallenge(`auth:${tenantId}`, { challenge: options.challenge, tenantId, rpID, origin: resolvedOrigin });
  return options;
}

export async function passkeyLoginComplete({ tenantId, credential }) {
  if (!tenantId || !credential) {
    throw new BadRequestError('tenantId and credential are required');
  }

  const stored = takeChallenge(`auth:${tenantId}`);
  if (!stored) {
    throw new BadRequestError('Authentication challenge expired. Please try again.');
  }

  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true, meta: true },
  });

  let matchedCustomer = null;
  let matchedPasskey = null;
  for (const c of customers) {
    const match = (c.meta?.passkeys || []).find(pk => pk.id === credential.id && pk.publicKey);
    if (match) {
      matchedCustomer = c;
      matchedPasskey = match;
      break;
    }
  }

  if (!matchedCustomer) {
    throw new UnauthorizedError('Passkey not recognized. Please register it again from your account page.');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: stored.origin,
      expectedRPID: stored.rpID,
      credential: {
        id: matchedPasskey.id,
        publicKey: Buffer.from(matchedPasskey.publicKey, 'base64url'),
        counter: matchedPasskey.counter || 0,
        transports: matchedPasskey.transports || [],
      },
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[passkey] authentication verification failed');
    throw new UnauthorizedError('Passkey verification failed');
  }
  if (!verification.verified) {
    throw new UnauthorizedError('Passkey verification failed');
  }

  // Persist the new signature counter (clone detection).
  const meta = { ...(matchedCustomer.meta || {}) };
  meta.passkeys = (meta.passkeys || []).map(pk =>
    pk.id === matchedPasskey.id
      ? { ...pk, counter: verification.authenticationInfo.newCounter }
      : pk,
  );
  await prisma.customer.update({ where: { id: matchedCustomer.id }, data: { meta } });

  const token = signAccessToken({
    sub: matchedCustomer.id,
    tenantId,
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
    phone: publicPhone(customer.phone),
    email: customer.meta?.email || null,
    address: customer.meta?.address || null,
    createdAt: customer.createdAt,
  };
}
