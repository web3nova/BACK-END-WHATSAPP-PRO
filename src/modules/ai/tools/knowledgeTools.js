import { retrieve } from '../../knowledge/pipeline/retriever.js';

export const searchKnowledge = {
  name: 'search_knowledge',
  description:
    'Search the business knowledge base for information about the business, its policies, products, services, pricing, or any topic covered in uploaded documents. Always call this before answering business-specific questions.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question or topic to search for' },
      topK: { type: 'number', description: 'Number of results (default 5)' },
    },
    required: ['query'],
  },
  async handler({ query, topK = 5 }, ctx) {
    const results = await retrieve({ tenantId: ctx.tenantId, query, topK });
    if (!results?.length) return { found: false, message: 'No relevant information found in the knowledge base.' };
    return {
      found: true,
      results: results.map(r => ({ content: r.payload?.content ?? r.content, score: r.score })),
    };
  },
};

export const knowledgeTools = [searchKnowledge];
