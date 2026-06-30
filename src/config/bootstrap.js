import prisma from './prisma.js';
import { config } from './index.js';
import { hashPassword } from '../common/utils/hash.js';
import { logger } from './logger.js';

export const bootstrapSuperAdmin = async () => {
  const email    = config.superAdmin.email;
  const password = config.superAdmin.password;

  if (!email || !password) {
    logger.warn('[bootstrap] SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD not set — skipping super admin seed');
    return;
  }

  const existing = await prisma.user.findFirst({ where: { email, isSuperAdmin: true } });
  if (existing) {
    logger.info(`[bootstrap] Super admin already exists (${email})`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email, passwordHash, isSuperAdmin: true, tenantId: null },
  });

  logger.info(`[bootstrap] Super admin created (${email})`);
};
