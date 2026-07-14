import { prisma } from '../../../config/prisma.js';

// The AI supplies items[].priceMinor itself, straight from the conversation —
// nothing previously checked that against the real catalog price before it
// became a payable order/quote total (createPaymentLink etc. trust
// order.totalMinor unconditionally). A model slip, a long negotiation-style
// exchange, or a customer pushing "you said ₦2,000 earlier" could produce a
// real checkout link for less than the true price. For any item carrying a
// productId, override the AI-supplied price with the catalog's real
// priceMinor; items with no productId are genuinely custom/bespoke work with
// no catalog price to check against, so those stay AI/staff-negotiated.
async function resolveItemPrices(items = [], tenantId) {
  const productIds = [...new Set(items.map((it) => it.productId).filter(Boolean))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, tenantId }, select: { id: true, priceMinor: true, name: true } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((it) => {
    if (!it.productId) return it;
    const product = byId.get(it.productId);
    // productId didn't resolve (wrong tenant, deleted, or hallucinated) —
    // don't silently fall back to trusting the AI's own price for it.
    if (!product) return { ...it, priceMinor: 0, name: it.name ? `${it.name} (unverified — product not found)` : 'Unverified item' };
    return { ...it, name: it.name || product.name, priceMinor: product.priceMinor };
  });
}

const sumItems = (items = []) =>
  items.reduce((acc, it) => acc + (it.priceMinor ?? 0) * (it.qty ?? 1), 0);

// Tool: generate a quotation for the customer.
export const createQuote = {
  name: 'create_quote',
  description:
    'Create a price quotation for the customer once you know the product(s), quantity and any custom details.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Line items being quoted',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            priceMinor: { type: 'number', description: 'Unit price in minor units (e.g. kobo). Ignored/overridden for catalog items if productId is given — the real catalog price always wins.' },
            productId: { type: 'string', description: 'The product id from search_products/get_price, if this line item is a real catalog product (not a custom/bespoke item). When given, the actual catalog price is used instead of priceMinor.' },
          },
          required: ['name'],
        },
      },
      currency: { type: 'string', description: 'ISO currency code, default NGN' },
      details: { type: 'object', description: 'Extra context (deadline, customizations, notes)' },
    },
    required: ['items'],
  },
  async handler({ items, currency = 'NGN', details = {} }, ctx) {
    const resolvedItems = await resolveItemPrices(items, ctx.tenantId);
    const amountMinor = sumItems(resolvedItems);

    // Same webhook-redelivery duplicate risk as create_order — see comment there.
    if (ctx.conversationId) {
      const recent = await prisma.quote.findFirst({
        where: {
          conversationId: ctx.conversationId,
          amountMinor,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        return { quoteId: recent.id, amountMinor: recent.amountMinor, currency: recent.currency, status: recent.status, deduplicated: true };
      }
    }

    const quote = await prisma.quote.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId ?? null,
        conversationId: ctx.conversationId ?? null,
        status: 'sent',
        amountMinor,
        currency,
        details: { items: resolvedItems, ...details },
      },
    });
    return { quoteId: quote.id, amountMinor, currency, status: quote.status };
  },
};

// Tool: create an order.
export const createOrder = {
  name: 'create_order',
  description: 'Create an order after the customer confirms a quote or items to purchase.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            priceMinor: { type: 'number', description: 'Ignored/overridden for catalog items if productId is given — the real catalog price always wins.' },
            productId: { type: 'string', description: 'The product id from search_products/get_price, if this line item is a real catalog product (not a custom/bespoke item). When given, the actual catalog price is used instead of priceMinor.' },
          },
          required: ['name'],
        },
      },
      measurements: { type: 'object', description: 'Customer measurements if applicable' },
      currency: { type: 'string' },
      quoteId: { type: 'string', description: 'If this order is the customer accepting a quote you generated earlier in this conversation, pass its quoteId here so it gets linked and marked accepted.' },
    },
    required: ['items'],
  },
  async handler({ items, measurements = {}, currency = 'NGN', quoteId }, ctx) {
    const resolvedItems = await resolveItemPrices(items, ctx.tenantId);
    const totalMinor = sumItems(resolvedItems);

    // Idempotency guard: WhatsApp redelivers webhooks it doesn't get a fast
    // 200 for, which can spin up a second AI turn for the same customer
    // confirmation before the first has finished. Without this, that
    // produces two identical orders a few seconds apart. If an order for
    // this conversation with the same total was just created, return it
    // instead of creating a duplicate.
    if (ctx.conversationId) {
      const recent = await prisma.order.findFirst({
        where: {
          conversationId: ctx.conversationId,
          totalMinor,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        return { orderId: recent.id, totalMinor: recent.totalMinor, currency: recent.currency, status: recent.status, deduplicated: true };
      }
    }

    // Only link a quote that's actually this tenant's and not already tied to another order.
    const quote = quoteId
      ? await prisma.quote.findFirst({ where: { id: quoteId, tenantId: ctx.tenantId, orderId: null } })
      : null;

    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId ?? null,
        conversationId: ctx.conversationId ?? null,
        status: 'pending',
        totalMinor,
        currency,
        items: resolvedItems,
        measurements,
      },
    });

    if (quote) {
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'accepted', orderId: order.id } });
    }

    return { orderId: order.id, totalMinor, currency, status: order.status, ...(quote ? { linkedQuoteId: quote.id } : {}) };
  },
};

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

function summarizeOrder(order) {
  const firstItem = Array.isArray(order.items) ? order.items[0] : null;
  return {
    orderId: order.id,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    product: firstItem?.name || null,
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    totalMinor: order.totalMinor,
    currency: order.currency,
    createdAt: order.createdAt,
  };
}

// Tool: look up an order's current status — mirrors exactly what the
// business sees on their dashboard Orders page (same 5 statuses, same fields).
export const getOrderStatus = {
  name: 'get_order_status',
  description:
    "Check the current status of an order (pending, confirmed, paid, fulfilled, or cancelled) — the same status shown on the business's Orders dashboard. Pass orderId if you know it (e.g. from create_order earlier in this conversation). If the customer asks about an order without giving an id, omit orderId to get their most recent orders instead.",
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order id, if known.' },
    },
  },
  async handler({ orderId }, ctx) {
    if (orderId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: ctx.tenantId } });
      if (!order) return { found: false, message: 'Order not found.' };
      return { found: true, order: summarizeOrder(order) };
    }

    if (!ctx.customerId) {
      return { found: false, message: 'No orderId given and no customer on record to look up recent orders for.' };
    }
    const orders = await prisma.order.findMany({
      where: { tenantId: ctx.tenantId, customerId: ctx.customerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (!orders.length) return { found: false, message: 'No orders found for this customer.' };
    return { found: true, orders: orders.map(summarizeOrder) };
  },
};

// Tool: update an existing order — measurements, or move it to confirmed/cancelled.
// Deliberately does NOT allow the AI to set 'paid' or 'fulfilled' — those are
// staff-only, confirmed manually from the dashboard (see report_payment_receipt
// for the payment-verification flow). This is enforced here, not just in the
// prompt, so it can't be talked around.
export const updateOrder = {
  name: 'update_order',
  description: 'Update an order — set status to confirmed/cancelled, or attach/replace measurements. Cannot mark an order paid or fulfilled — only staff can do that from the dashboard after verifying payment.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      status: {
        type: 'string',
        enum: ['confirmed', 'cancelled'],
      },
      measurements: { type: 'object' },
    },
    required: ['orderId'],
  },
  async handler({ orderId, status, measurements }, ctx) {
    // Scope the update to the tenant to prevent cross-tenant writes.
    const existing = await prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
    });
    if (!existing) return { updated: false, message: 'Order not found.' };

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(status ? { status } : {}),
        ...(measurements ? { measurements } : {}),
      },
    });
    return { updated: true, orderId: order.id, status: order.status };
  },
};

export const orderTools = [createQuote, createOrder, getOrderStatus, updateOrder];

export default orderTools;
