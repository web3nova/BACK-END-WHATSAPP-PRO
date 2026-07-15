import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { hashPassword } from '../../common/utils/hash.js';
import { sendMail } from '../../config/mailer.js';
import { superAdminWelcomeEmail } from '../../config/emailTemplates.js';
import { logger } from '../../config/logger.js';
import { proxyAssetUrl } from '../../common/utils/uploadAsset.js';

// Resolves a business logo to a stable URL (raw signed URLs expire, ~1hr) —
// mirrors business.service.js's withFreshLogoUrl, applied to the
// tenant.business relation.
function withLogoUrl(tenant) {
  if (!tenant) return tenant;
  const { business, ...rest } = tenant;
  if (!business?.logoStorageKey) return { ...rest, logoUrl: business?.logoUrl || null };
  return { ...rest, logoUrl: proxyAssetUrl('business-logos', business.logoStorageKey) };
}

const ADMIN_URL = process.env.ADMIN_URL || 'https://admin.biziq.online';

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
export const listTenants = async ({ page = 1, limit = 25, search = '' } = {}) => {
  const take = Math.min(limit, 100);
  const skip = Math.max(0, (page - 1) * take);
  const where = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }, { domain: { contains: search, mode: 'insensitive' } }] }
    : {};

  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true, name: true, slug: true, domain: true, status: true, createdAt: true,
        subscription: { select: { status: true, plan: { select: { name: true } } } },
      business: { select: { logoUrl: true, logoStorageKey: true, phone: true, whatsappNumber: true } },
        _count: { select: { users: true, orders: true } },
      },
    }),
  ]);

  return { data: await Promise.all(tenants.map(withLogoUrl)), meta: { total, page, limit: take } };
};

export const getTenantDetail = async (id) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true, name: true, slug: true, domain: true, status: true, createdAt: true,
      subscription: {
        select: { id: true, status: true, planId: true, renewsAt: true, trialEndsAt: true, plan: { select: { id: true, name: true, label: true } } },
      },
      business: { select: { logoUrl: true, logoStorageKey: true, phone: true, whatsappNumber: true } },
      _count: { select: { users: true, orders: true, customers: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  return withLogoUrl(tenant);
};

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

export const createSuperAdmin = async ({ email, name }, requestingUserId) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) throw new BadRequestError('Email already in use');

  // No one — including the creator — ever sets or sees this account's
  // password. It starts unusable (random hash, never given to the user) and
  // the new admin sets their own via the emailed set-password link.
  const unusablePasswordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

  const admin = await prisma.user.create({
    data: { email, passwordHash: unusablePasswordHash, name, isSuperAdmin: true, tenantId: null },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: admin.id, token, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) }, // 7 days to accept
  });
  const setPasswordUrl = `${ADMIN_URL}/reset-password?token=${token}`;

  const requester = requestingUserId
    ? await prisma.user.findUnique({ where: { id: requestingUserId }, select: { name: true, email: true } })
    : null;

  sendMail({
    to: email,
    subject: 'You\'ve been added as a BizIQ super admin',
    html: superAdminWelcomeEmail({ name, email, addedBy: requester?.name || requester?.email, setPasswordUrl }),
  }).catch((err) => logger.error(`[admin] super admin welcome email failed for ${email}: ${err.message}`));

  return admin;
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

export const listTenantRoles = async (tenantId) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant not found');
  // Roles are either tenant-specific or global defaults (tenantId: null)
  return prisma.role.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    orderBy: { name: 'asc' },
  });
};

export default {
  getPlatformStats,
  listTenants,
  getTenantDetail,
  listTenantRoles,
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