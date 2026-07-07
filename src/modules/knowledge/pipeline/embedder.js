// @owner Dev 3 — AI & Knowledge Engine
import { getEmbeddingProvider } from '../../ai/providers/index.js';

// Vector dimensions: jina-embeddings-v3 = 1024, OpenAI text-embedding-3-small = 1536
export const EMBED_DIM = process.env.AI_EMBEDDING_PROVIDER === 'openai' ? 1536 : 1024;

// Keep batches modest to stay under provider request limits.
const BATCH_SIZE = 96;

/**
 * Embed an array of text chunks into vectors.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  if (!texts?.length) return [];
  const provider = getEmbeddingProvider();
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    vectors.push(...(await provider.embed(batch)));
  }
  return vectors;
}

export async function embedOne(text) {
  const [vec] = await embedTexts([text]);
  return vec;
}

export default embedTexts;
