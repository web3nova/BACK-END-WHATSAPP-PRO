import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { hashPassword } from '../../common/utils/hash.js';

// ── Platform stats ──
export const getPlatformStats = async () => {
  const [
    totalTenants,
    activeTenants,
    totalUsers,
    totalOrders,
    suspendedTenants,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { isSuperAdmin: false } }),
    prisma.order.count(),
    prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
  ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalOrders,
  };
};

// ── Tenant management ──
export const suspendTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError('Tenant not found');
  if (tenant.status === 'SUSPENDED') {
    throw new BadRequestError('Tenant is already suspended');
  }

  return prisma.tenant.update({
    where: { id },
    data: { status: 'SUSPENDED' },
  });
};

export const activateTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError('Tenant not found');
  if (tenant.status === 'ACTIVE') {
    throw new BadRequestError('Tenant is already active');
  }

  return prisma.tenant.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
};

// ── User management ──
export const listTenantUsers = async (tenantId) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant not found');

  return prisma.user.findMany({
    where: { tenantId, isSuperAdmin: false },
    select: {
      id: true,
      email: true,
      name: true,
      isBanned: true,
      roleId: true,
      role: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const banUser = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (user.isSuperAdmin) throw new BadRequestError('Cannot ban a super admin');
  if (user.isBanned) throw new BadRequestError('User is already banned');

  return prisma.user.update({
    where: { id: userId },
    data: { isBanned: true },
    select: { id: true, email: true, name: true, isBanned: true },
  });
};

export const unbanUser = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (!user.isBanned) throw new BadRequestError('User is not banned');

  return prisma.user.update({
    where: { id: userId },
    data: { isBanned: false },
    select: { id: true, email: true, name: true, isBanned: true },
  });
};

export const assignRole = async (userId, roleId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (user.isSuperAdmin) throw new BadRequestError('Cannot assign roles to a super admin');

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Role not found');

  return prisma.user.update({
    where: { id: userId },
    data: { roleId },
    select: { id: true, email: true, name: true, roleId: true, role: { select: { id: true, name: true } } },
  });
};

// ── Super admin user management ──
export const listSuperAdmins = async () => {
  return prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const createSuperAdmin = async ({ email, password, name }) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) throw new BadRequestError('Email already in use');

  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: { email, passwordHash, name, isSuperAdmin: true, tenantId: null },
    select: { id: true, email: true, name: true, createdAt: true },
  });
};

export const deleteSuperAdmin = async (id, requestingUserId) => {
  if (id === requestingUserId) {
    throw new BadRequestError('You cannot delete your own super admin account');
  }

  const user = await prisma.user.findFirst({
    where: { id, isSuperAdmin: true },
  });
  if (!user) throw new NotFoundError('Super admin not found');

  await prisma.user.delete({ where: { id } });
  return { id };
};

// ── Subscription override (manual plan changes) ──
export const setTenantPlan = async (tenantId, { planId, status, renewsAt }) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const trialEndsAt = new Date(); // required field — set to now when overriding manually

  return prisma.subscription.upsert({
    where:  { tenantId },
    update: {
      ...(planId   !== undefined ? { planId }   : {}),
      ...(status   !== undefined ? { status }   : {}),
      ...(renewsAt !== undefined ? { renewsAt } : {}),
    },
    create: { tenantId, planId: planId || null, status: status || 'ACTIVE', renewsAt, trialEndsAt },
  });
};

export default {
  getPlatformStats,
  suspendTenant,
  activateTenant,
  listTenantUsers,
  banUser,
  unbanUser,
  assignRole,
  listSuperAdmins,
  createSuperAdmin,
  deleteSuperAdmin,
  setTenantPlan,
};