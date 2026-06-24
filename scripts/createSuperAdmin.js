import prisma from '../src/config/prisma.js';
import { hashPassword } from '../src/common/utils/hash.js';

const EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@platform.com';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperSecret123!';
const NAME     = process.env.SUPER_ADMIN_NAME     || 'Super Admin';

const createSuperAdmin = async () => {
  console.log('🔧 Creating super admin...');

  const existing = await prisma.user.findFirst({ where: { email: EMAIL } });

  if (existing) {
    console.log(`⚠️  User with email "${EMAIL}" already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);

  const user = await prisma.user.create({
    data: {
      tenantId:    null,  // super admins have no tenant
      email:       EMAIL,
      passwordHash,
      name:        NAME,
      isSuperAdmin: true,
    },
  });

  console.log(`✅ Super admin created: ${user.email}`);
};

createSuperAdmin()
  .catch((err) => {
    console.error('❌ Failed to create super admin:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());