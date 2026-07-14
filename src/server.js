import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { bootstrapSuperAdmin, bootstrapVectorDb } from './config/bootstrap.js';
import { startWorker } from './jobs/worker.js';
import { boss } from './config/pgboss.js';
import './jobs/billing.cron.js';
import './jobs/cartRecovery.cron.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}${config.apiPrefix}`);
});

// Run independently of the HTTP listener and each other — previously
// startWorker() was awaited behind bootstrapSuperAdmin()/bootstrapVectorDb()
// inside the listen() callback, so the API was already accepting webhooks
// (and enqueueing pg-boss jobs) for several seconds before the worker had
// even started polling. Nothing here depends on the others, so there's no
// reason to serialize them.
Promise.all([
  bootstrapSuperAdmin(),
  bootstrapVectorDb(),
  startWorker(),
]).catch((err) => {
  logger.error({ err: err.message }, '[server] startup task failed');
});

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  await boss.stop();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
