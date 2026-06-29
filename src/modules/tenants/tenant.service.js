import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';

export const listTenants = async ({ page = 1, limit = 20, status } = {}) => {
  const skip = (page - 1) * limit;
  const where = status ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { subscription: true, _count: { select: { users: true } } },
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { subscription: true, _count: { select: { users: true } } },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  return tenant;
};

export const updateTenant = async (id, { name, domain, status }) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError('Tenant not found');

  // Check domain uniqueness if being updated
  if (domain && domain !== tenant.domain) {
    const conflict = await prisma.tenant.findUnique({ where: { domain } });
    if (conflict) throw new BadRequestError('Domain already in use');
  }

  return prisma.tenant.update({
    where: { id },
    data: {
      ...(name   !== undefined ? { name }   : {}),
      ...(domain !== undefined ? { domain } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: { subscription: true },
  });
};

export const deleteTenant = async (id) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError('Tenant not found');

  // Delete in FK dependency order so no constraint is violated.
  // Each step must precede the table it references.
  await prisma.$transaction([
    // Leaf nodes that reference Message
    prisma.outboxMessage.deleteMany({ where: { tenantId: id } }),
    prisma.mediaAsset.deleteMany({ where: { tenantId: id } }),
    // Messages reference Conversations
    prisma.message.deleteMany({ where: { conversation: { tenantId: id } } }),
    // Conversations reference Customers
    prisma.conversation.deleteMany({ where: { tenantId: id } }),
    prisma.customer.deleteMany({ where: { tenantId: id } }),
    // Document chunks reference Documents
    prisma.documentChunk.deleteMany({ where: { tenantId: id } }),
    prisma.document.deleteMany({ where: { tenantId: id } }),
    // Inventory references Products
    prisma.inventory.deleteMany({ where: { tenantId: id } }),
    // Payments reference Orders (orderId nullable but safer to delete first)
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.order.deleteMany({ where: { tenantId: id } }),
    prisma.quote.deleteMany({ where: { tenantId: id } }),
    prisma.catalog.deleteMany({ where: { tenantId: id } }),
    // WebsitePage and WebsiteSettings reference Business
    prisma.websitePage.deleteMany({ where: { business: { tenantId: id } } }),
    prisma.websiteSettings.deleteMany({ where: { business: { tenantId: id } } }),
    prisma.business.deleteMany({ where: { tenantId: id } }),
    prisma.product.deleteMany({ where: { tenantId: id } }),
    prisma.whatsappAccount.deleteMany({ where: { tenantId: id } }),
    // OtpToken and PasswordResetToken reference User (no onDelete cascade)
    prisma.otpToken.deleteMany({ where: { user: { tenantId: id } } }),
    prisma.passwordResetToken.deleteMany({ where: { user: { tenantId: id } } }),
    // RefreshToken has onDelete: Cascade on User, but delete explicitly to be safe
    prisma.refreshToken.deleteMany({ where: { user: { tenantId: id } } }),
    prisma.user.deleteMany({ where: { tenantId: id } }),
    prisma.role.deleteMany({ where: { tenantId: id } }),
    prisma.subscription.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.delete({ where: { id } }),
  ]);

  return { id };
};

// Called internally when a tenant self-updates their own profile
export const updateOwnTenant = async (tenantId, { name, domain }) => {
  return updateTenant(tenantId, { name, domain });
};

export default { listTenants, getTenant, updateTenant, deleteTenant, updateOwnTenant };