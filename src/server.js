import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { bootstrapSuperAdmin, bootstrapVectorDb } from './config/bootstrap.js';
import { startWorker } from './jobs/worker.js';
import { boss } from './config/pgboss.js';
import './jobs/billing.cron.js';
import './jobs/cartRecovery.cron.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  logger.info(`API listening on http://localhost:${config.port}${config.apiPrefix}`);
  await bootstrapSuperAdmin();
  await bootstrapVectorDb();
  await startWorker();
});

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  await boss.stop();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
