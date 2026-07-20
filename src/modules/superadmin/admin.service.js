import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { hashPassword } from '../../common/utils/hash.js';
import { sendMail } from '../../config/mailer.js';
import { superAdminWelcomeEmail, tenantSuspendedEmail, tenantActivatedEmail, tenantDeletedEmail, userBannedEmail, userUnbannedEmail } from '../../config/emailTemplates.js';
import { logger } from '../../config/logger.js';
import { proxyAssetUrl } from '../../common/utils/uploadAsset.js';

// Resolves a business logo to a stable URL (raw signed URLs expire, ~1hr) —
// mirrors business.service.js's withFreshLogoUrl, applied to the
// tenant.business relation. Also surfaces the tenant's actual current name:
// tenant.name is set once at signup and never updated again, while
// business.displayName is what the owner sets in Settings and can change any
// time — showing tenant.name in admin meant a rename never appeared there.
function withLogoUrl(tenant) {
  if (!tenant) return tenant;
  const { business, ...rest } = tenant;
  const logoUrl = business?.logoStorageKey
    ? proxyAssetUrl('business-logos', business.logoStorageKey)
    : (business?.logoUrl || null);
  return { ...rest, name: business?.displayName || rest.name, business, logoUrl };
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
      business: { select: { displayName: true, logoUrl: true, logoStorageKey: true, phone: true, whatsappNumber: true } },
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
      business: { select: { displayName: true, logoUrl: true, logoStorageKey: true, phone: true, whatsappNumber: true } },
      _count: { select: { users: true, orders: true, customers: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  return withLogoUrl(tenant);
};

export const suspendTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: { take: 1, orderBy: { createdAt: 'asc' } },
      business: { select: { displayName: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  if (tenant.status === 'SUSPENDED') {
    throw new BadRequestError('Tenant is already suspended');
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: { status: 'SUSPENDED' },
  });

  const ownerEmail = tenant.users[0]?.email;
  if (ownerEmail) {
    sendMail({
      to: ownerEmail,
      subject: 'Your BizIQ account has been suspended',
      html: tenantSuspendedEmail({ businessName: tenant.business?.displayName || tenant.name }),
    }).catch((err) => logger.error(`[admin] Tenant suspended email failed for ${ownerEmail}: ${err.message}`));
  }

  return updated;
};

export const activateTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: { take: 1, orderBy: { createdAt: 'asc' } },
      business: { select: { displayName: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  if (tenant.status === 'ACTIVE') {
    throw new BadRequestError('Tenant is already active');
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });

  const ownerEmail = tenant.users[0]?.email;
  if (ownerEmail) {
    sendMail({
      to: ownerEmail,
      subject: 'Your BizIQ account has been reactivated',
      html: tenantActivatedEmail({ businessName: tenant.business?.displayName || tenant.name }),
    }).catch((err) => logger.error(`[admin] Tenant activated email failed for ${ownerEmail}: ${err.message}`));
  }

  return updated;
};

// Irreversibly wipes a tenant and every row that belongs to it. Only
// `Invite` and product-child tables (ProductVariant, Inventory, ProductReview
// via their `product` relation, RefreshToken via `user`) have onDelete:
// Cascade in the schema — everything else here would otherwise block the
// final tenant delete on a foreign-key violation, so this deletes explicitly
// in dependency order (children before the parents they reference) rather
// than trust that every relevant migration applied cascade exactly as
// schema.prisma declares it. Wrapped in one transaction: if any step fails,
// nothing is deleted.
export const deleteTenant = async (id, confirmName) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: { take: 1, orderBy: { createdAt: 'asc' } },
      business: { select: { displayName: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  // Require the caller to echo back the name exactly as shown on the detail
  // page — which is business.displayName when set (see withLogoUrl), not the
  // raw tenant.name that never updates after a rename — the same "type the
  // name to confirm" pattern as any other irreversible-delete UI, enforced
  // server-side so it can't be skipped by calling the API directly.
  const displayedName = tenant.business?.displayName || tenant.name;
  if (confirmName !== displayedName) {
    throw new BadRequestError('Tenant name confirmation does not match.');
  }
  // Captured before the transaction below deletes the user rows — this is
  // the last point the owner's email is still readable.
  const ownerEmail = tenant.users[0]?.email;

  const business = await prisma.business.findUnique({ where: { tenantId: id }, select: { id: true } });

  await prisma.$transaction([
    // Rows with no dependents of their own, or that reference two tenant-
    // scoped parents at once (must go before either parent) — deleted first.
    prisma.productReview.deleteMany({ where: { tenantId: id } }),
    prisma.mediaAsset.deleteMany({ where: { tenantId: id } }),
    prisma.outboxMessage.deleteMany({ where: { tenantId: id } }),
    // Message has no tenantId column — filtered through its conversation.
    prisma.message.deleteMany({ where: { conversation: { tenantId: id } } }),
    prisma.abandonedCart.deleteMany({ where: { tenantId: id } }),
    prisma.quote.deleteMany({ where: { tenantId: id } }),
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.order.deleteMany({ where: { tenantId: id } }),
    prisma.conversation.deleteMany({ where: { tenantId: id } }),
    prisma.customer.deleteMany({ where: { tenantId: id } }),

    prisma.productVariant.deleteMany({ where: { product: { tenantId: id } } }),
    prisma.inventory.deleteMany({ where: { tenantId: id } }),
    prisma.product.deleteMany({ where: { tenantId: id } }),
    prisma.coupon.deleteMany({ where: { tenantId: id } }),
    prisma.catalog.deleteMany({ where: { tenantId: id } }),

    prisma.documentChunk.deleteMany({ where: { tenantId: id } }),
    prisma.document.deleteMany({ where: { tenantId: id } }),

    // Website tables key off businessId, not tenantId directly.
    ...(business ? [
      prisma.websiteMedia.deleteMany({ where: { businessId: business.id } }),
      prisma.websitePage.deleteMany({ where: { businessId: business.id } }),
      prisma.websiteSettingsRevision.deleteMany({ where: { businessId: business.id } }),
      prisma.websiteSettings.deleteMany({ where: { businessId: business.id } }),
    ] : []),
    prisma.business.deleteMany({ where: { tenantId: id } }),

    prisma.whatsappAccount.deleteMany({ where: { tenantId: id } }),
    prisma.paymentConfig.deleteMany({ where: { tenantId: id } }),
    prisma.onboardingStepData.deleteMany({ where: { tenantId: id } }),
    prisma.onboardingProgress.deleteMany({ where: { tenantId: id } }),
    prisma.onboardingOverride.deleteMany({ where: { tenantId: id } }),
    prisma.notification.deleteMany({ where: { tenantId: id } }),
    prisma.websiteVisit.deleteMany({ where: { tenantId: id } }),
    prisma.subscription.deleteMany({ where: { tenantId: id } }),

    // User-owned tokens without cascade (RefreshToken has it, but included
    // here too for clarity/defense-in-depth). Must precede the User delete.
    prisma.passwordResetToken.deleteMany({ where: { user: { tenantId: id } } }),
    prisma.otpToken.deleteMany({ where: { user: { tenantId: id } } }),
    prisma.refreshToken.deleteMany({ where: { user: { tenantId: id } } }),
    prisma.user.deleteMany({ where: { tenantId: id } }),

    // Tenant-scoped custom roles (platform roles have tenantId: null — untouched).
    prisma.role.deleteMany({ where: { tenantId: id } }),

    // Invite already cascades via the schema; deleted explicitly too so this
    // function doesn't silently depend on that staying true.
    prisma.invite.deleteMany({ where: { tenantId: id } }),

    prisma.tenant.delete({ where: { id } }),
  ]);

  if (ownerEmail) {
    sendMail({
      to: ownerEmail,
      subject: 'Your BizIQ account has been deleted',
      html: tenantDeletedEmail({ businessName: displayedName }),
    }).catch((err) => logger.error(`[admin] Tenant deleted email failed for ${ownerEmail}: ${err.message}`));
  }

  return { id, name: displayedName, deleted: true };
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

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: true },
    select: { id: true, email: true, name: true, isBanned: true },
  });

  const tenant = user.tenantId ? await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }) : null;
  sendMail({
    to: updated.email,
    subject: 'Your BizIQ account access has been suspended',
    html: userBannedEmail({ name: updated.name, businessName: tenant?.name }),
  }).catch((err) => logger.error(`[admin] User banned email failed for ${updated.email}: ${err.message}`));

  return updated;
};

export const unbanUser = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (!user.isBanned) throw new BadRequestError('User is not banned');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: false },
    select: { id: true, email: true, name: true, isBanned: true },
  });

  const tenant = user.tenantId ? await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }) : null;
  sendMail({
    to: updated.email,
    subject: 'Your BizIQ account access has been restored',
    html: userUnbannedEmail({ name: updated.name, businessName: tenant?.name }),
  }).catch((err) => logger.error(`[admin] User unbanned email failed for ${updated.email}: ${err.message}`));

  return updated;
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