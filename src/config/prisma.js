import { PrismaClient } from '@prisma/client';

// Limit Prisma's connection pool to preserve room for pg-boss on Neon free tier
const dbUrl = new URL(process.env.DATABASE_URL)
dbUrl.searchParams.set('connection_limit', '3')
dbUrl.searchParams.set('pool_timeout', '10')
dbUrl.searchParams.set('pgbouncer', 'true')

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: { db: { url: dbUrl.toString() } },
});

// Keepalive: prevent Neon free-tier idle shutdown by pinging every 3 minutes
const KEEPALIVE_INTERVAL = 3 * 60 * 1000
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch { /* ignore */ }
}, KEEPALIVE_INTERVAL).unref()

export default prisma;
