import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

export async function listCustomers(tenantId, query = {}) {
  const { page, limit, skip } = paginate(query);
  const [total, items] = await prisma.$transaction([
    prisma.customer.count({ where: { tenantId } }),
    prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

export async function getCustomer(tenantId, customerId) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError('Customer not found');
  return customer;
}

export async function updateCustomer(tenantId, customerId, data) {
  const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!existing) throw new NotFoundError('Customer not found');
  return prisma.customer.update({ where: { id: customerId }, data });
}

export async function deleteCustomer(tenantId, customerId) {
  const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!existing) throw new NotFoundError('Customer not found');
  await prisma.customer.delete({ where: { id: customerId } });
  return { deleted: true };
}

export default { listCustomers, getCustomer, updateCustomer, deleteCustomer };
