import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import processAiReply from './processors/aiReply.job.js';
import processOutbox from './processors/outbox.job.js';
import processNotification from './processors/notification.job.js';

let workerInstance = null;

export const startWorker = () => {
  if (workerInstance) return workerInstance;

  logger.info('[worker] starting background worker');

  const worker = new Worker('main', async (job) => {
    switch (job.name) {
      case 'aiReply':
        await processAiReply(job);
        break;
      case 'sendOutbox':
        await processOutbox(job);
        break;
      case 'sendNotification':
        await processNotification(job);
        break;
      default:
        logger.warn({ jobName: job.name }, '[worker] unknown job name');
    }
  }, { connection: redis, checkCompatibility: false });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, '[worker] job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job.id, jobName: job.name, err: err.message }, '[worker] job failed');
  });

  workerInstance = worker;
  return workerInstance;
};

// When run as a standalone process (`npm run worker`), handle shutdown here.
// When embedded inside server.js, server.js owns the shutdown lifecycle.
if (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker.ts')) {
  const worker = startWorker();
  const shutdown = async (signal) => {
    logger.info({ signal }, '[worker] shutting down');
    try {
      await worker.close();
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
