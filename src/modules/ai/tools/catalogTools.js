// @owner Dev 3 — AI & Knowledge Engine
import { prisma } from '../../../config/prisma.js';
import { config } from '../../../config/index.js';
import { pushEvent } from '../../sse/sse.service.js';
import { encryptMessage } from '../../../common/utils/encryption.js';

const money = (minor, currency) => ({ amountMinor: minor, currency, display: `${minor / 100}` });

// product.imageUrl is a presigned S3/R2 URL captured at upload time and
// expires after ~1hr — every other product-reading path (product.service.js's
// withFreshImageUrl) rebuilds it from imageStorageKey through the
// /assets/product-images/:key proxy on each read instead of trusting the
// stored value. This tool read product.imageUrl directly, so by the time the
// AI sent it hours later WhatsApp silently failed to fetch the expired URL.
function freshImageUrl(product) {
  if (product.imageStorageKey) return `${config.appUrl}/assets/product-images/${product.imageStorageKey}`;
  return product.imageUrl || null;
}

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };
function mimeTypeFromKey(key) {
  const ext = (key || '').split('.').pop()?.toLowerCase();
  return MIME_BY_EXT[ext] || 'image/jpeg';
}

// Ranks candidates by whole-word matches against the product's own name —
// productSearchWhere matches substrings across name/description/category/
// brand/tags for broad recall, which is fine for search_products (the AI
// reads the list and disambiguates itself), but get_price needs a single
// winner. Plain substring scoring picks the wrong product for queries like
// "men kaftan": "men" is a literal substring of "Women's Kaftan" too, so
// score by whole words (split on non-alphanumeric) instead.
function bestMatch(candidates, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const nameWords = c.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const score = words.reduce((n, w) => {
      const stripped = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : null;
      return n + (nameWords.includes(w) || (stripped && nameWords.includes(stripped)) ? 1 : 0);
    }, 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// Matches name, description, category, brand, or tags — not just the exact
// product name. Customers describe things naturally ("NFT", "smart contract"),
// not by literal SKU/name, so a name-only search misses real catalog matches.
//
// Matched word-by-word (AND across words, OR across fields) rather than as one
// whole-phrase substring — a customer typing "men kaftan" won't include the
// apostrophe in "Men's Kaftan", so a single `contains: "men kaftan"` matched
// nothing. Splitting on words means "men" alone still matches "Men's" as a
// substring, while "kaftan" matches the rest, regardless of punctuation.
function productSearchWhere(tenantId, query) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const terms = words.length ? words : [query];
  return {
    tenantId,
    isActive: true,
    AND: terms.map((word) => {
      // A glued possessive typed without the apostrophe ("mens") isn't a
      // substring of the stored "men's" either — try it with a trailing
      // "s" stripped too, so "mens"/"kaftans" still line up.
      const variants = [word];
      if (word.length > 3 && word.toLowerCase().endsWith('s')) {
        variants.push(word.slice(0, -1));
      }
      const fieldMatches = (field) => variants.map((v) => ({ [field]: { contains: v, mode: 'insensitive' } }));
      return {
        OR: [
          ...fieldMatches('name'),
          ...fieldMatches('description'),
          ...fieldMatches('category'),
          ...fieldMatches('brand'),
          ...variants.map((v) => ({ tags: { has: v } })),
        ],
      };
    }),
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
      hasImage: !!(p.imageStorageKey || p.imageUrl),
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
    const candidates = await prisma.product.findMany({
      where: productSearchWhere(ctx.tenantId, productName),
      take: 10,
    });
    if (!candidates.length) return { found: false, message: `No product matching "${productName}".` };
    const product = bestMatch(candidates, productName);
    return { found: true, name: product.name, price: money(product.priceMinor, product.currency), hasImage: !!(product.imageStorageKey || product.imageUrl) };
  },
};

// Tool: send one or more product photos to the customer on WhatsApp. Images
// can't be embedded in a text reply — this queues real WhatsApp media
// messages, same delivery path as staff-sent images.
//
// Takes a batch of items rather than one productId, so "show me these 5
// items" costs one tool-calling step instead of five — each image call
// previously ate a full step out of the AI's MAX_STEPS budget, so a
// multi-item request could burn through it before the AI even got to
// answer the actual question, hitting the truncation/escalation path on a
// perfectly ordinary request.
export const sendProductImage = {
  name: 'send_product_image',
  description:
    'Send plain photos (no cart button) of one or more products to the customer on WhatsApp in a single call. Use this only when the customer just wants to SEE a picture and is not shopping to buy — for shopping, prefer send_products, which sends shoppable cards with an add-to-cart button. Pass every product they want to see at once — do not call this tool separately per item. Only include products with hasImage: true (check search_products/get_price first).',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Every product photo to send in this call.',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'The product id from search_products' },
            caption: { type: 'string', description: 'Optional short caption to send with the image (e.g. the product name and price).' },
          },
          required: ['productId'],
        },
      },
    },
    required: ['items'],
  },
  async handler({ items }, ctx) {
    const customer = ctx.customerId
      ? await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { phone: true } })
      : null;
    if (!customer?.phone) return { results: items.map(() => ({ sent: false, message: 'No customer phone number on record.' })) };

    const { sendMessage } = await import('../../whatsapp/whatsapp.service.js');
    const results = [];
    for (const { productId, caption } of items) {
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId } });
      if (!product) { results.push({ productId, sent: false, message: 'Product not found.' }); continue; }
      const imageUrl = freshImageUrl(product);
      if (!imageUrl) { results.push({ productId, sent: false, message: 'This product has no image to send.' }); continue; }

      await sendMessage(ctx.tenantId, customer.phone, {
        type: 'media',
        mediaType: 'image',
        url: imageUrl,
        caption: caption || product.name,
      });

      // Record it the same way sendStaffMedia does — otherwise the image
      // only ever exists on the customer's phone: no Message row means it's
      // gone from chat history on reload, and no SSE push means it doesn't
      // show up live in the dashboard either, even though WhatsApp
      // delivered it fine.
      const text = caption || product.name;
      const mimeType = mimeTypeFromKey(product.imageStorageKey || imageUrl);
      const message = await prisma.message.create({
        data: { conversationId: ctx.conversationId, role: 'ai', content: encryptMessage(text), meta: { productId } },
      });
      await prisma.mediaAsset.create({
        data: {
          tenantId: ctx.tenantId,
          messageId: message.id,
          provider: 'upload',
          mimeType,
          storageKey: product.imageStorageKey || imageUrl,
          url: imageUrl,
        },
      });
      await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
      pushEvent(ctx.tenantId, 'ai_message', {
        conversationId: ctx.conversationId,
        message: { id: message.id, role: 'ai', content: text, createdAt: message.createdAt, media: [{ mimeType, url: imageUrl }] },
      });

      results.push({ productId, sent: true, message: 'Image queued for delivery.' });
    }

    return { results };
  },
};

// Tool: send one or more catalog products to the customer as native WhatsApp
// interactive product cards. Unlike send_product_image (a plain photo), these
// carry WhatsApp's built-in "View"/"Add to cart" buttons wired to the
// business's synced Meta catalog, so the customer can add items to their
// WhatsApp cart and place an order without leaving the chat.
//
// Interactive product messages only work for products already synced into the
// connected Meta catalog — Meta rejects the entire send if any retailer_id is
// missing. So we verify each product against the live catalog first and send
// shoppable cards only for confirmed ones, quietly falling back to a plain
// photo for any that aren't synced (or when commerce isn't set up at all).
export const sendProducts = {
  name: 'send_products',
  description:
    'Send one or more products to the customer as shoppable WhatsApp product cards with a built-in cart button, so they can add items to their WhatsApp cart and order without leaving the chat. Prefer this over send_product_image whenever the customer is shopping or asking about specific products to buy. Pass every product to show in a single call (get the ids from search_products first). If the catalog isn\'t set up, it automatically falls back to sending photos.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Every product to show, in the order to display them.',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'The product id from search_products' },
          },
          required: ['productId'],
        },
      },
      bodyText: { type: 'string', description: 'Short message shown with the product(s), e.g. "Here are the phones you asked about".' },
      headerText: { type: 'string', description: 'Short title shown above the list when sending multiple products, e.g. "Our Phones".' },
    },
    required: ['items'],
  },
  async handler({ items, bodyText, headerText }, ctx) {
    const customer = ctx.customerId
      ? await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { phone: true } })
      : null;
    if (!customer?.phone) return { sent: false, message: 'No customer phone number on record.' };

    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, tenantId: ctx.tenantId },
    });
    if (!products.length) return { sent: false, message: 'None of those products were found.' };

    // Preserve the AI's requested order.
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = items.map((i) => byId.get(i.productId)).filter(Boolean);
    const retailerId = (p) => p.sku || p.id;

    const { getCommerce, filterSyncedRetailerIds } = await import('../../whatsapp/commerce.service.js');
    const commerce = await getCommerce(ctx.tenantId);
    const synced = commerce?.catalogId
      ? await filterSyncedRetailerIds(ctx.tenantId, ordered.map(retailerId))
      : new Set();

    const shoppable = ordered.filter((p) => synced.has(retailerId(p)));
    const photoOnly = ordered.filter((p) => !synced.has(retailerId(p)));

    const { sendMessage } = await import('../../whatsapp/whatsapp.service.js');
    const outcomes = [];

    // 1. Shoppable interactive product cards for synced products.
    if (shoppable.length) {
      let interactive;
      if (shoppable.length === 1) {
        interactive = {
          type: 'product',
          ...(bodyText ? { body: { text: bodyText } } : {}),
          action: { catalog_id: commerce.catalogId, product_retailer_id: retailerId(shoppable[0]) },
        };
      } else {
        interactive = {
          type: 'product_list',
          header: { type: 'text', text: (headerText || 'Products').slice(0, 60) },
          body: { text: bodyText || 'Here are some products you might like.' },
          action: {
            catalog_id: commerce.catalogId,
            sections: [{
              title: (headerText || 'Products').slice(0, 24),
              product_items: shoppable.map((p) => ({ product_retailer_id: retailerId(p) })),
            }],
          },
        };
      }
      await sendMessage(ctx.tenantId, customer.phone, { type: 'interactive', interactive });

      const summary = shoppable.length === 1
        ? `🛍️ Shared product: ${shoppable[0].name}`
        : `🛍️ Shared ${shoppable.length} products: ${shoppable.map((p) => p.name).join(', ')}`;
      const message = await prisma.message.create({
        data: { conversationId: ctx.conversationId, role: 'ai', content: encryptMessage(summary), meta: { productIds: shoppable.map((p) => p.id), interactive: true } },
      });
      await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
      pushEvent(ctx.tenantId, 'ai_message', {
        conversationId: ctx.conversationId,
        message: { id: message.id, role: 'ai', content: summary, createdAt: message.createdAt },
      });
      outcomes.push(`${shoppable.length} shoppable card(s) sent`);
    }

    // 2. Fall back to a plain photo for anything not in the synced catalog.
    for (const p of photoOnly) {
      const imageUrl = freshImageUrl(p);
      if (!imageUrl) { outcomes.push(`${p.name}: not in catalog and no image to send`); continue; }
      await sendMessage(ctx.tenantId, customer.phone, {
        type: 'media', mediaType: 'image', url: imageUrl, caption: p.name,
      });
      const text = p.name;
      const mimeType = mimeTypeFromKey(p.imageStorageKey || imageUrl);
      const message = await prisma.message.create({
        data: { conversationId: ctx.conversationId, role: 'ai', content: encryptMessage(text), meta: { productId: p.id } },
      });
      await prisma.mediaAsset.create({
        data: { tenantId: ctx.tenantId, messageId: message.id, provider: 'upload', mimeType, storageKey: p.imageStorageKey || imageUrl, url: imageUrl },
      });
      await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
      pushEvent(ctx.tenantId, 'ai_message', {
        conversationId: ctx.conversationId,
        message: { id: message.id, role: 'ai', content: text, createdAt: message.createdAt, media: [{ mimeType, url: imageUrl }] },
      });
      outcomes.push(`${p.name}: sent as photo (not in catalog yet)`);
    }

    return { sent: true, shoppable: shoppable.length, photoFallback: photoOnly.length, message: outcomes.join('; ') };
  },
};

// Tool: fetch the latest JSONB catalog payload (diagram: "JSONB Catalogs") —
// a separate, optional bulk-upload feature (CSV/form import), distinct from
// the structured Product records search_products/get_price read from.
//
// If the business has defined a WhatsApp catalog arrangement, returns the
// organized structure (sections with items) instead of a flat product list.
// Falls back to the real product list when no arrangement exists.
export const fetchCatalog = {
  name: 'fetch_catalog',
  description: 'Fetch the full catalog for this business organized by sections/categories. Returns products grouped into named sections (like "New Arrivals", "Best Sellers") with their prices and stock. If no catalog arrangement exists, falls back to a plain product list. Use this when the customer asks "what do you have", "show me everything", or wants to browse the full catalog.',
  parameters: { type: 'object', properties: {} },
  async handler(_input, ctx) {
    const arrangement = await prisma.catalogArrangement.findFirst({
      where: { tenantId: ctx.tenantId, isActive: true, isDefault: true },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                product: {
                  select: {
                    id: true, name: true, description: true,
                    priceMinor: true, currency: true, stock: true,
                    category: true, brand: true,
                    imageStorageKey: true, imageUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (arrangement?.sections?.length) {
      return {
        source: 'arrangement',
        arrangement: arrangement.name,
        sections: arrangement.sections.map((s) => ({
          name: s.name,
          description: s.description,
          items: s.items.map((i) => ({
            id: i.product.id,
            name: i.product.name,
            description: i.product.description,
            price: money(i.customPriceMinor ?? i.product.priceMinor, i.product.currency),
            stock: i.product.stock,
            category: i.product.category,
            brand: i.product.brand,
            hasImage: !!(i.product.imageStorageKey || i.product.imageUrl),
          })),
        })),
      };
    }

    const catalog = await prisma.catalog.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (catalog?.data) return catalog.data;

    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      take: 50,
    });
    if (!products.length) return { message: 'No catalog uploaded, and no products in the catalog yet.' };
    return {
      source: 'products',
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: money(p.priceMinor, p.currency),
        stock: p.stock,
        category: p.category,
      })),
    };
  },
};

// NOTE: search_knowledge lives in knowledgeTools.js — do not redeclare it here.
// Duplicate tool names make Google/Gemini providers reject the whole request
// with "Duplicate function declaration found".

export const catalogTools = [searchProducts, getPrice, fetchCatalog, sendProducts, sendProductImage];

export default catalogTools;
