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

  // Cascade: delete users, roles, subscription first to avoid FK violations
  await prisma.$transaction([
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