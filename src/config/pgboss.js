import { PgBoss } from 'pg-boss';
import { config } from './index.js';
import { logger } from './logger.js';

// pg-boss requires a direct (non-pooled) Postgres connection because it uses
// LISTEN/NOTIFY for real-time job dispatch. Neon's pgBouncer pooler (the URL
// containing '-pooler') runs in transaction mode and drops session-level commands
// like LISTEN, making workers deaf. Strip '-pooler' to get the direct endpoint.
const pgbossUrl = (process.env.DIRECT_DATABASE_URL || config.databaseUrl).replace(
  /-pooler(\.[^/]+)/,
  '$1',
);

const boss = new PgBoss({
  connectionString: pgbossUrl,
  max: 3,
  deleteAfterDays: 3,
  retryLimit: 3,
  retryBackoff: true,
  monitorStateIntervalSeconds: 30,
  noSupervisor: false,
});

boss.on('error', (err) => {
  logger.error({ err: err.message }, '[pgboss] error');
});

let started = false;

export async function startBoss() {
  if (started) return boss;
  await boss.start();
  started = true;
  logger.info('[pgboss] started — using Postgres for background jobs');
  return boss;
}

export { boss };
export default boss;
