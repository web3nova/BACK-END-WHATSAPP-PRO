// src/modules/users/user.service.js
import prisma from '../../config/prisma.js';
import { hashPassword } from '../../common/utils/hash.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { mergeTourProgress } from './tour-progress.js';

const sanitize = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

export const listUsers = async (tenantId, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: { tenantId } }),
  ]);

  return {
    items: items.map(sanitize),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUser = async (tenantId, id) => {
  const user = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!user) throw new NotFoundError('User not found');
  return sanitize(user);
};

export const createUser = async (tenantId, { email, password, name, roleId }) => {
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) throw new BadRequestError('Email already in use for this tenant');

  if (roleId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!role) throw new BadRequestError('Invalid roleId');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { tenantId, email, passwordHash, name, roleId },
  });

  return sanitize(user);
};

export const updateUser = async (tenantId, id, { name, roleId }) => {
  const existing = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('User not found');

  if (roleId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!role) throw new BadRequestError('Invalid roleId');
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(roleId !== undefined ? { roleId } : {}),
    },
  });

  return sanitize(user);
};

export const deleteUser = async (tenantId, id) => {
  const existing = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('User not found');

  await prisma.user.delete({ where: { id } });
  return { id };
};

export const getTours = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tours: true } });
  if (!user) throw new NotFoundError('User not found');
  return user.tours || {};
};

export const updateTours = async (userId, tourId, update) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tours: true } });
  if (!user) throw new NotFoundError('User not found');
  const tours = mergeTourProgress(user.tours, tourId, update);
  await prisma.user.update({ where: { id: userId }, data: { tours } });
  return tours;
};

export default { listUsers, getUser, createUser, updateUser, deleteUser, getTours, updateTours };