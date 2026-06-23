// @owner Dev 3 — AI & Knowledge Engine
import { embedDocument } from '../../modules/knowledge/knowledge.service.js';
import { logger } from '../../config/logger.js';

export const EMBEDDING_JOB = 'document.embed';

/**
 * BullMQ processor for async document embedding.
 * Enqueue with: queue.add(EMBEDDING_JOB, { documentId, tenantId })
 * Wire into the worker in src/jobs/worker.js.
 *
 * @param {import('bullmq').Job} job
 */
export async function embeddingProcessor(job) {
  const { documentId, tenantId } = job.data;
  logger.info({ documentId, tenantId }, 'embedding document');
  const result = await embedDocument(documentId, tenantId);
  logger.info({ documentId, ...result }, 'embedding complete');
  return result;
}

export default embeddingProcessor;
