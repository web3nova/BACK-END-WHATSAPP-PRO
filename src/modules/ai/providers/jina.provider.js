// Jina AI embeddings — 8M tokens/month free tier
// API key: https://jina.ai — sign up, copy key, set JINA_API_KEY

const JINA_BASE = 'https://api.jina.ai/v1';
// jina-embeddings-v3 max is 1024 dimensions
const EMBED_DIM = 1024;
const JINA_EMBED_MODEL = process.env.JINA_EMBED_MODEL || 'jina-embeddings-v3';
const BATCH_SIZE = 64;

export const jinaProvider = {
  name: 'jina',

  async embed(texts) {
    const input = Array.isArray(texts) ? texts : [texts];
    const all = [];

    for (let i = 0; i < input.length; i += BATCH_SIZE) {
      const batch = input.slice(i, i + BATCH_SIZE);
      const res = await fetch(`${JINA_BASE}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        },
        body: JSON.stringify({
          model: JINA_EMBED_MODEL,
          input: batch,
          dimensions: EMBED_DIM,
          normalized: true,
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.status);
        throw new Error(`Jina embedding failed: ${err}`);
      }

      const json = await res.json();
      all.push(...json.data.map((d) => d.embedding));
    }

    return all;
  },
};

export default jinaProvider;
