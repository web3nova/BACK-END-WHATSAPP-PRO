import { qdrant, COLLECTION } from '../../../config/vectordb.js';
import { embedOne } from './embedder.js';

/**
 * Retrieve the most relevant document chunks for a query, scoped to a tenant.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.query
 * @param {number} [params.topK=5]
 * @returns {Promise<Array<{ content: string, score: number, documentId: string }>>}
 */
export async function retrieve({ tenantId, query, topK = 5 }) {
  const vector = await embedOne(query);
  if (!vector) return [];

  const results = await qdrant.search(COLLECTION, {
    vector,
    limit: topK,
    // Tenant isolation: only search this tenant's vectors.
    filter: { must: [{ key: 'tenantId', match: { value: tenantId } }] },
    with_payload: true,
  });

  return results.map((r) => ({
    content: r.payload?.content ?? '',
    documentId: r.payload?.documentId,
    score: r.score,
  }));
}

export default retrieve;
