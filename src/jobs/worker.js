import { boss, startBoss } from '../config/pgboss.js';
import { logger } from '../config/logger.js';
import processAiReply from './processors/aiReply.job.js';
import processOutbox from './processors/outbox.job.js';
import processNotification from './processors/notification.job.js';
import processAutoRelease from './processors/autoRelease.job.js';

// pg-boss wraps handlers: job = { id, name, data, ... }
// Our processors already expect { data } so this is a direct match.

let started = false;

export const startWorker = async () => {
  if (started) return;
  await startBoss();

  await boss.work('aiReply', { teamSize: 2, teamConcurrency: 2 }, processAiReply);
  await boss.work('sendOutbox', { teamSize: 5, teamConcurrency: 5 }, processOutbox);
  await boss.work('sendNotification', { teamSize: 2, teamConcurrency: 2 }, processNotification);
  await boss.work('autoRelease', { teamSize: 1, teamConcurrency: 1 }, processAutoRelease);

  started = true;
  logger.info('[worker] pg-boss worker started — listening for aiReply, sendOutbox, sendNotification, autoRelease');
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
