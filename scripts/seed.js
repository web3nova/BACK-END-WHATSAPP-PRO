// scripts/seed.js
import prisma from '../src/config/prisma.js';
import { ROLE_PRESETS } from '../src/common/constants/permissions.js';

const seed = async () => {
  console.log('🌱 Seeding default roles...');

  for (const [roleName, permissions] of Object.entries(ROLE_PRESETS)) {
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, name: roleName },
    });

    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { permissions },
      });
      console.log(`  🔄 Role updated: ${roleName}`);
    } else {
      await prisma.role.create({
        data: { tenantId: null, name: roleName, permissions },
      });
      console.log(`  ✅ Role created: ${roleName}`);
    }
  }

  console.log('✅ Seeding complete.');
};

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());