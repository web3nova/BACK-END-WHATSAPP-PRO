import prisma from '../src/config/prisma.js';
import { ROLE_PRESETS } from '../src/common/constants/permissions.js';

const seed = async () => {
  console.log('🌱 Seeding default roles...');

  for (const [roleName, permissions] of Object.entries(ROLE_PRESETS)) {
    await prisma.role.upsert({
      where: {
        tenantId_name: { tenantId: null, name: roleName },
      },
      update: { permissions },
      create: {
        tenantId: null, // platform-level roles, available to all tenants
        name: roleName,
        permissions,
      },
    });
    console.log(`  ✅ Role seeded: ${roleName}`);
  }

  console.log('✅ Seeding complete.');
};

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());