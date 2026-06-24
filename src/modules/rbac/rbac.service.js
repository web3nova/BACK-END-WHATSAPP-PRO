import prisma from '../../config/prisma.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../common/errors/index.js';

export const listRoles = async (tenantId) => {
  return prisma.role.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    orderBy: { name: 'asc' },
  });
};

export const getRole = async (tenantId, id) => {
  const role = await prisma.role.findFirst({
    where: { id, OR: [{ tenantId }, { tenantId: null }] },
  });
  if (!role) throw new NotFoundError('Role not found');
  return role;
};

export const createRole = async (tenantId, { name, permissions }) => {
  const existing = await prisma.role.findFirst({
    where: { tenantId, name },
  });
  if (existing) throw new BadRequestError(`Role "${name}" already exists`);

  return prisma.role.create({
    data: { tenantId, name, permissions },
  });
};

export const updateRole = async (tenantId, id, { name, permissions }) => {
  const role = await prisma.role.findFirst({ where: { id, tenantId } });
  if (!role) throw new NotFoundError('Role not found');

  // Prevent renaming to a name already taken in this tenant
  if (name && name !== role.name) {
    const conflict = await prisma.role.findFirst({ where: { tenantId, name } });
    if (conflict) throw new BadRequestError(`Role "${name}" already exists`);
  }

  return prisma.role.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    },
  });
};

export const deleteRole = async (tenantId, id) => {
  const role = await prisma.role.findFirst({ where: { id, tenantId } });
  if (!role) throw new NotFoundError('Role not found');

  // Unassign users before deleting
  await prisma.user.updateMany({
    where: { tenantId, roleId: id },
    data: { roleId: null },
  });

  await prisma.role.delete({ where: { id } });
  return { id };
};

export const assignRole = async (tenantId, userId, roleId) => {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new NotFoundError('User not found');

  if (roleId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!role) throw new BadRequestError('Invalid roleId');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { roleId },
    select: { id: true, email: true, name: true, roleId: true },
  });
};

export default { listRoles, getRole, createRole, updateRole, deleteRole, assignRole };