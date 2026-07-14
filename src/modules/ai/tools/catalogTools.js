// @owner Dev 3 — AI & Knowledge Engine
import { prisma } from '../../../config/prisma.js';

const money = (minor, currency) => ({ amountMinor: minor, currency, display: `${minor / 100}` });

// Matches name, description, category, brand, or tags — not just the exact
// product name. Customers describe things naturally ("NFT", "smart contract"),
// not by literal SKU/name, so a name-only search misses real catalog matches.
function productSearchWhere(tenantId, query) {
  const term = { contains: query, mode: 'insensitive' };
  return {
    tenantId,
    isActive: true,
    OR: [
      { name: term },
      { description: term },
      { category: term },
      { brand: term },
      { tags: { has: query } },
    ],
  };
}

// Tool: search the product catalog (Postgres) by free text.
export const searchProducts = {
  name: 'search_products',
  description:
    'Search the business product catalog by name, description, category, brand, or tag. Matches natural-language terms, not just exact product names — try this before assuming a product does not exist. If a broad term returns nothing, try a shorter or more general keyword before concluding there is no match.',
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
      where: productSearchWhere(ctx.tenantId, query),
      take: Math.min(limit, 20),
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: money(p.priceMinor, p.currency),
      stock: p.stock,
      attributes: p.attributes,
      hasImage: !!p.imageUrl,
    }));
  },
};

// Tool: get the price of a specific product.
export const getPrice = {
  name: 'get_price',
  description: 'Get the price of a specific product by (approximate) name, description, or category.',
  parameters: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'The product name or a descriptive keyword' },
    },
    required: ['productName'],
  },
  async handler({ productName }, ctx) {
    const product = await prisma.product.findFirst({
      where: productSearchWhere(ctx.tenantId, productName),
    });
    if (!product) return { found: false, message: `No product matching "${productName}".` };
    return { found: true, name: product.name, price: money(product.priceMinor, product.currency), hasImage: !!product.imageUrl };
  },
};

// Tool: send a product photo to the customer on WhatsApp. Images can't be
// embedded in a text reply — this queues a real WhatsApp media message,
// same delivery path as staff-sent images.
export const sendProductImage = {
  name: 'send_product_image',
  description:
    'Send a photo of a specific product to the customer on WhatsApp. Use this when the customer asks to see a product, or when showing a picture would help them decide. Only works if the product has an image (check hasImage from search_products/get_price first) — do not call this for a product with no image.',
  parameters: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'The product id from search_products' },
      caption: { type: 'string', description: 'Optional short caption to send with the image (e.g. the product name and price).' },
    },
    required: ['productId'],
  },
  async handler({ productId, caption }, ctx) {
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId } });
    if (!product) return { sent: false, message: 'Product not found.' };
    if (!product.imageUrl) return { sent: false, message: 'This product has no image to send.' };

    const customer = ctx.customerId
      ? await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { phone: true } })
      : null;
    if (!customer?.phone) return { sent: false, message: 'No customer phone number on record.' };

    const { sendMessage } = await import('../../whatsapp/whatsapp.service.js');
    await sendMessage(ctx.tenantId, customer.phone, {
      type: 'media',
      mediaType: 'image',
      url: product.imageUrl,
      caption: caption || product.name,
    });

    return { sent: true, message: 'Image queued for delivery.' };
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

// NOTE: search_knowledge lives in knowledgeTools.js — do not redeclare it here.
// Duplicate tool names make Google/Gemini providers reject the whole request
// with "Duplicate function declaration found".

export const catalogTools = [searchProducts, getPrice, fetchCatalog, sendProductImage];

export default catalogTools;
