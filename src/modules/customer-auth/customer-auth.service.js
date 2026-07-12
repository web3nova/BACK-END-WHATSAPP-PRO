import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import { signAccessToken } from '../../common/utils/token.js';

const SALT_ROUNDS = 10;

export async function signup({ tenantId, name, phone, password }) {
  if (!tenantId || !name || !phone || !password) {
    throw new BadRequestError('tenantId, name, phone, and password are required');
  }
  if (password.length < 6) {
    throw new BadRequestError('Password must be at least 6 characters');
  }

  const existing = await prisma.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });

  if (existing) {
    throw new BadRequestError('An account with this phone number already exists. Please log in.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const customer = await prisma.customer.create({
    data: {
      tenantId,
      phone,
      name,
      meta: { passwordHash, signupVia: 'storefront' },
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

export async function login({ tenantId, phone, password }) {
  if (!tenantId || !phone || !password) {
    throw new BadRequestError('tenantId, phone, and password are required');
  }

  const customer = await prisma.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });

  if (!customer) {
    throw new UnauthorizedError('No account found with this phone number');
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
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
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
