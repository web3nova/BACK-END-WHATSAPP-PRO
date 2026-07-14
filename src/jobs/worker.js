import { boss, startBoss } from '../config/pgboss.js';
import { logger } from '../config/logger.js';
import processAiReply from './processors/aiReply.job.js';
import processOutbox from './processors/outbox.job.js';
import processNotification from './processors/notification.job.js';
import processAutoRelease from './processors/autoRelease.job.js';
import processCartRecovery from './processors/cartRecovery.job.js';

// pg-boss v10: work() handlers receive an ARRAY of jobs (batch), not a single
// job. Our processors expect a single { data } job, so unwrap the batch here.
// Handler errors are also logged explicitly — pg-boss records failures on the
// job row but does not print them, which makes silent failures invisible.
const wrap = (name, processor) => async (jobs) => {
  for (const job of jobs) {
    logger.info({ queue: name, jobId: job.id }, '[worker] job received');
    try {
      await processor(job);
    } catch (err) {
      logger.error({ queue: name, jobId: job.id, err: err.message }, '[worker] job failed');
      throw err; // rethrow so pg-boss records the failure and retries
    }
  }
};

let started = false;

export const startWorker = async () => {
  if (started) return;
  await startBoss();

  // pg-boss v10 requires explicit queue creation (no longer auto-created on work/send)
  const queues = ['aiReply', 'sendOutbox', 'sendNotification', 'autoRelease', 'cartRecovery'];
  await Promise.all(queues.map(q => boss.createQueue(q)));

  await boss.work('aiReply', { batchSize: 2 }, wrap('aiReply', processAiReply));
  await boss.work('sendOutbox', { batchSize: 5 }, wrap('sendOutbox', processOutbox));
  await boss.work('sendNotification', { batchSize: 2 }, wrap('sendNotification', processNotification));
  await boss.work('autoRelease', { batchSize: 1 }, wrap('autoRelease', processAutoRelease));
  await boss.work('cartRecovery', { batchSize: 5 }, wrap('cartRecovery', processCartRecovery));

  started = true;
  logger.info('[worker] pg-boss worker started — listening for aiReply, sendOutbox, sendNotification, autoRelease, cartRecovery');
};

if (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker.ts')) {
  startWorker().catch((err) => {
    logger.error({ err: err.message }, '[worker] failed to start');
    process.exit(1);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, '[worker] shutting down');
    try {
      await boss.stop();
      logger.info('[worker] graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err: err?.message }, '[worker] error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
