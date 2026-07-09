import PgBoss from 'pg-boss';
import { config } from './index.js';
import { logger } from './logger.js';

const boss = new PgBoss({
  connectionString: config.databaseUrl,
  // Keep completed/failed jobs for 3 days so we can inspect them
  deleteAfterDays: 3,
  // Retry failed jobs up to 3 times with exponential backoff
  retryLimit: 3,
  retryBackoff: true,
  // Monitor interval — how often to check for jobs (ms)
  monitorStateIntervalSeconds: 30,
  // Suppress pg-boss internal error logs for connection hiccups — we handle those
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
