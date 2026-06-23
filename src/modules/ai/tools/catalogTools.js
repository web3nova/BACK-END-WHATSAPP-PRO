// @owner Dev 3 — AI & Knowledge Engine
import { prisma } from '../../../config/prisma.js';
import { retrieve } from '../../knowledge/pipeline/retriever.js';

const money = (minor, currency) => ({ amountMinor: minor, currency, display: `${minor / 100}` });

// Tool: search the product catalog (Postgres) by free text.
export const searchProducts = {
  name: 'search_products',
  description:
    'Search the business product catalog by name or keyword. Returns matching products with prices.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Product name or keyword to search for' },
      limit: { type: 'number', description: 'Max results (default 5)' },
    },
    required: ['query'],
  },
  async handler({ query, limit = 5 }, ctx) {
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, name: { contains: query, mode: 'insensitive' } },
      take: Math.min(limit, 20),
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: money(p.priceMinor, p.currency),
      stock: p.stock,
      attributes: p.attributes,
    }));
  },
};

// Tool: get the price of a specific product.
export const getPrice = {
  name: 'get_price',
  description: 'Get the price of a specific product by (approximate) name.',
  parameters: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'The product name' },
    },
    required: ['productName'],
  },
  async handler({ productName }, ctx) {
    const product = await prisma.product.findFirst({
      where: { tenantId: ctx.tenantId, name: { contains: productName, mode: 'insensitive' } },
    });
    if (!product) return { found: false, message: `No product matching "${productName}".` };
    return { found: true, name: product.name, price: money(product.priceMinor, product.currency) };
  },
};

// Tool: fetch the latest JSONB catalog payload (diagram: "JSONB Catalogs").
export const fetchCatalog = {
  name: 'fetch_catalog',
  description: 'Fetch the latest full catalog (categories, items, pricing) for this business.',
  parameters: { type: 'object', properties: {} },
  async handler(_input, ctx) {
    const catalog = await prisma.catalog.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return catalog?.data ?? { message: 'No catalog uploaded yet.' };
  },
};

// Tool: semantic search over uploaded knowledge documents (RAG bridge).
export const searchKnowledge = {
  name: 'search_knowledge',
  description:
    'Search uploaded business documents (pricing sheets, policies, FAQs) for an answer. Use for questions not covered by the structured catalog.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question or topic to look up' },
    },
    required: ['query'],
  },
  async handler({ query }, ctx) {
    const chunks = await retrieve({ tenantId: ctx.tenantId, query, topK: 5 });
    if (!chunks.length) return { matches: [], message: 'No relevant documents found.' };
    return { matches: chunks.map((c) => ({ content: c.content, score: c.score })) };
  },
};

export const catalogTools = [searchProducts, getPrice, fetchCatalog, searchKnowledge];

export default catalogTools;
