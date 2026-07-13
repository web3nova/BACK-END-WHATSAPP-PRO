import { prisma } from '../../../config/prisma.js';

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
            priceMinor: { type: 'number', description: 'Unit price in minor units (e.g. kobo)' },
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
    const amountMinor = sumItems(items);

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
        details: { items, ...details },
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
            priceMinor: { type: 'number' },
          },
          required: ['name'],
        },
      },
      measurements: { type: 'object', description: 'Customer measurements if applicable' },
      currency: { type: 'string' },
    },
    required: ['items'],
  },
  async handler({ items, measurements = {}, currency = 'NGN' }, ctx) {
    const totalMinor = sumItems(items);

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

    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId ?? null,
        conversationId: ctx.conversationId ?? null,
        status: 'pending',
        totalMinor,
        currency,
        items,
        measurements,
      },
    });
    return { orderId: order.id, totalMinor, currency, status: order.status };
  },
};

// Tool: update an existing order (status, measurements).
export const updateOrder = {
  name: 'update_order',
  description: 'Update an order — set status or attach/replace measurements.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      status: {
        type: 'string',
        enum: ['pending', 'confirmed', 'paid', 'fulfilled', 'cancelled'],
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

export const orderTools = [createQuote, createOrder, updateOrder];

export default orderTools;
