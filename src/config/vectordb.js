import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './index.js';

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
});

export const COLLECTION = config.qdrant.collection;

// Ensure the collection exists with the correct vector size. Recreates if dimensions mismatch.
export async function ensureCollection(vectorSize = 1024) {
  const { collections } = await qdrant.getCollections();
  const existing = collections.find((c) => c.name === COLLECTION);
  if (existing) {
    const info = await qdrant.getCollection(COLLECTION);
    const currentSize = info.config?.params?.vectors?.size;
    if (currentSize && currentSize !== vectorSize) {
      await qdrant.deleteCollection(COLLECTION);
    } else {
      return;
    }
  }
  await qdrant.createCollection(COLLECTION, {
    vectors: { size: vectorSize, distance: 'Cosine' },
  });
}

export default qdrant;
