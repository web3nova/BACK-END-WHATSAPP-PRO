import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './index.js';

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
});

export const COLLECTION = config.qdrant.collection;

// Ensure the collection exists (call once on boot / worker start).
export async function ensureCollection(vectorSize = 1536) {
  const { collections } = await qdrant.getCollections();
  if (!collections.find((c) => c.name === COLLECTION)) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
  }
}

export default qdrant;
