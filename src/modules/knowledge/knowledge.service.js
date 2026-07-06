import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { qdrant, COLLECTION, ensureCollection } from '../../config/vectordb.js';
import { extractText } from './pipeline/extractor.js';
import { chunkText } from './pipeline/chunker.js';
import { embedTexts, EMBED_DIM } from './pipeline/embedder.js';
import { retrieve } from './pipeline/retriever.js';

/**
 * Ingest an uploaded document: extract -> chunk -> persist chunks ->
 * embed -> upsert vectors to Qdrant -> mark ready.
 *
 * Runs the embedding step inline. For large files, call embedDocument()
 * from the BullMQ embedding job instead (see jobs/processors/embedding.job.js).
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {object} params.file - multer file { buffer, mimetype, originalname }
 * @param {boolean} [params.inlineEmbed=true]
 */
export async function ingestDocument({ tenantId, file, inlineEmbed = true }) {
  const document = await prisma.document.create({
    data: { tenantId, filename: file.originalname, mimeType: file.mimetype, size: file.size ?? null, status: 'processing' },
  });

  try {
    const text = await extractText(file);
    const chunks = chunkText(text);

    if (!chunks.length) {
      await prisma.document.update({ where: { id: document.id }, data: { status: 'failed' } });
      return { documentId: document.id, chunks: 0, status: 'failed' };
    }

    await prisma.documentChunk.createMany({
      data: chunks.map((content, position) => ({
        id: randomUUID(),
        documentId: document.id,
        tenantId,
        content,
        position,
      })),
    });

    if (inlineEmbed) {
      await embedDocument(document.id, tenantId);
    }

    return { documentId: document.id, chunks: chunks.length, status: inlineEmbed ? 'ready' : 'pending' };
  } catch (err) {
    logger.error({ err, documentId: document.id, tenantId }, 'document ingest failed');
    await prisma.document.update({ where: { id: document.id }, data: { status: 'failed' } });
    throw err;
  }
}

/**
 * Embed all un-vectorized chunks of a document and upsert them to Qdrant.
 * Idempotent: skips chunks that already have a vectorId.
 */
export async function embedDocument(documentId, tenantId) {
  await ensureCollection(EMBED_DIM);

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId, vectorId: null },
    orderBy: { position: 'asc' },
  });
  if (!chunks.length) {
    await prisma.document.update({ where: { id: documentId }, data: { status: 'ready' } });
    return { embedded: 0 };
  }

  const vectors = await embedTexts(chunks.map((c) => c.content));

  await qdrant.upsert(COLLECTION, {
    points: chunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      payload: { tenantId, documentId, content: c.content, position: c.position },
    })),
  });

  // Mark chunks as vectorized (vectorId === point id === chunk id).
  await Promise.all(
    chunks.map((c) =>
      prisma.documentChunk.update({ where: { id: c.id }, data: { vectorId: c.id } }),
    ),
  );

  await prisma.document.update({ where: { id: documentId }, data: { status: 'ready' } });
  return { embedded: chunks.length };
}

/** Semantic search over a tenant's knowledge base. */
export async function search({ tenantId, query, topK = 5 }) {
  return retrieve({ tenantId, query, topK });
}

/** List documents for a tenant. */
export async function listDocuments(tenantId) {
  return prisma.document.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      status: true,
      size: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
  });
}

export default { ingestDocument, embedDocument, search, listDocuments };
