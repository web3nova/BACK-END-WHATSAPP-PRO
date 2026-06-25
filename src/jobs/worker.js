import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import processAiReply from './processors/aiReply.job.js';
import processOutbox from './processors/outbox.job.js';
// other processors like embedding.job.js could be imported here

let workerInstance = null;

export const startWorker = () => {
  if (workerInstance) return workerInstance;

  console.log('[Worker] Starting background worker...');

  const worker = new Worker('main', async (job) => {
    switch (job.name) {
      case 'aiReply':
        await processAiReply(job);
        break;
      case 'sendOutbox':
        await processOutbox(job);
        break;
      // Add other cases here
      default:
        console.warn(`[Worker] Unknown job name: ${job.name}`);
    }
  }, { connection: redis });

  worker.on('completed', job => {
    console.log(`[Worker] Job ${job.id} completed!`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed with error ${err.message}`);
  });

  // Graceful shutdown helper
  const shutdown = async (signal) => {
    console.log(`[Worker] ${signal} received — shutting down worker...`);
    try {
      await worker.close();
      console.log('[Worker] Graceful shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[Worker] Error during shutdown', err?.message || err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  workerInstance = worker;
  return workerInstance;
};

// Start worker immediately if this file is run directly (e.g. `npm run worker`)
if (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker.ts')) {
  startWorker();
}
