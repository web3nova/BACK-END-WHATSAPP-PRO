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
    const quote = await prisma.quote.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId ?? null,
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
    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId ?? null,
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
