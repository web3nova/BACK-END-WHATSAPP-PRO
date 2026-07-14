import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { notify } from '../notifications/notification.service.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { pushEvent } from '../sse/sse.service.js';
import { logger } from '../../config/logger.js';
import { newOrderEmail } from '../../config/emailTemplates.js';

const orderSelect = {
  id: true,
  tenantId: true,
  customerId: true,
  conversationId: true,
  status: true,
  totalMinor: true,
  currency: true,
  items: true,
  measurements: true,
  createdAt: true,
  updatedAt: true,
};

const customerSelect = {
  id: true,
  phone: true,
  name: true,
  meta: true,
  createdAt: true,
};

const toRecordMap = (rows) => new Map(rows.map((row) => [row.id, row]));

async function loadCustomers(tenantId, customerIds = []) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const customers = await prisma.customer.findMany({
    where: { tenantId, id: { in: ids } },
    select: customerSelect,
  });

  return toRecordMap(customers);
}

function attachCustomer(record, customerMap) {
  return {
    ...record,
    customer: record.customerId ? customerMap.get(record.customerId) ?? null : null,
  };
}

async function ensureCustomerExists(tenantId, customerId) {
  if (!customerId) return null;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });

  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  return customerId;
}

export const listOrders = async (tenantId, filters = {}) => {
  const where = { tenantId };
  if (filters.status) where.status = filters.status;
  if (filters.customerId) where.customerId = filters.customerId;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: orderSelect,
  });

  const customerMap = await loadCustomers(tenantId, orders.map((order) => order.customerId));
  return orders.map((order) => attachCustomer(order, customerMap));
};

export const getOrder = async (tenantId, id) => {
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: orderSelect,
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const customerMap = await loadCustomers(tenantId, [order.customerId]);
  return attachCustomer(order, customerMap);
};

// notify=true only when customer places via storefront/AI; staff-created orders skip it
export const createOrder = async (tenantId, data, { notify: sendNotify = false } = {}) => {
  const customerId = await ensureCustomerExists(tenantId, data.customerId ?? null);

  // Only link a quote that's actually this tenant's and not already tied to another order.
  const quote = data.quoteId
    ? await prisma.quote.findFirst({ where: { id: data.quoteId, tenantId, orderId: null } })
    : null;

  const order = await prisma.order.create({
    data: {
      tenantId,
      customerId,
      conversationId: data.conversationId ?? null,
      status: data.status,
      totalMinor: data.totalMinor,
      currency: data.currency,
      items: data.items ?? [],
      measurements: data.measurements ?? {},
    },
    select: orderSelect,
  });

  if (quote) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'accepted', orderId: order.id } });
  }

  const customerMap = await loadCustomers(tenantId, [order.customerId]);
  const result = attachCustomer(order, customerMap);

  // Send order confirmation to the customer's WhatsApp and record it in the
  // conversation so it appears in chat history like any other message.
  const phone = result.customer?.phone;
  if (phone) {
    const ref = order.id.slice(0, 8).toUpperCase();
    const amountMajor = (order.totalMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const itemLines = (order.items || [])
      .map((it) => `• ${it.name}${it.qty ? ` x${it.qty}` : ''}${it.size ? ` (${it.size})` : ''}`);
    const lines = [
      `🛒 *Order #${ref}*`,
      ...itemLines,
      `Total: *${order.currency} ${amountMajor}*`,
      `Status: ${order.status}`,
      '',
      'We will keep you updated on your order.',
    ];
    const text = lines.join('\n');
    try {
      await sendMessage(tenantId, phone, text);
      if (order.conversationId) {
        const message = await prisma.message.create({
          data: { conversationId: order.conversationId, role: 'staff', content: text, meta: { orderId: order.id } },
        });
        pushEvent(tenantId, 'staff_message', {
          conversationId: order.conversationId,
          message: { id: message.id, role: 'staff', content: text, createdAt: message.createdAt },
        });
      }
    } catch (err) {
      logger.warn({ err: err.message, orderId: order.id }, '[order] WhatsApp confirmation failed');
    }
  }

  if (sendNotify) {
    const amount = order.totalMinor ? `₦${(order.totalMinor / 100).toLocaleString()}` : '';
    const customerName = result.customer?.name || result.customer?.phone || 'A customer';
    notify(tenantId, {
      type: 'new_order',
      title: `New order from ${customerName}`,
      body: `Order ${amount ? `for ${amount} ` : ''}has been placed and is awaiting fulfillment.`,
      emailSubject: `New order received — ${amount || 'check your dashboard'}`,
      emailHtml: newOrderEmail({ customerName, amount: amount || '—', orderRef: order.id.slice(0, 8).toUpperCase() }),
      metadata: { orderId: order.id, conversationId: order.conversationId ?? undefined },
      outbound: true,
    }).catch(() => {});
  }

  return result;
};

const NOTIFIABLE_STATUSES = new Set(['confirmed', 'shipped', 'delivered', 'cancelled']);

const STATUS_UPDATE_LINES = {
  confirmed: 'Your order has been confirmed ✅',
  shipped: 'Your order is on its way 🚚',
  delivered: 'Your order has been delivered 🎉',
  cancelled: 'Your order has been cancelled. Contact us if this is unexpected.',
};

function sendOrderStatusWhatsApp(tenantId, order, status, customer) {
  const phone = order.measurements?.customerWhatsapp || order.measurements?.customerPhone || customer?.phone;
  if (!phone) return;

  const ref = order.id.slice(0, 8).toUpperCase();
  const extraLine = STATUS_UPDATE_LINES[status];

  const message = [
    `📦 *Order #${ref} update*`,
    `Status: ${status}`,
    ...(extraLine ? [extraLine] : []),
    'Thank you for shopping with us!',
  ].join('\n');

  sendMessage(tenantId, phone, message).catch(() => {});
}

export const updateOrderStatus = async (tenantId, id, status) => {
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, customerId: true, status: true, items: true, measurements: true },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const isCancelling = status === 'cancelled' && order.status !== 'cancelled';
  const statusChanged = order.status !== status;

  const orderResult = await prisma.$transaction(async (tx) => {
    if (isCancelling) {
      for (const item of order.items || []) {
        if (!item?.productId || !item?.quantity) continue;
        await tx.product.updateMany({
          where: { id: item.productId, tenantId, trackStock: true },
          data: { stock: { increment: Number(item.quantity) } },
        });
      }
    }

    return tx.order.update({
      where: { id },
      data: { status },
    });
  });

  const customerMap = await loadCustomers(tenantId, [order.customerId]);
  const customer = order.customerId ? customerMap.get(order.customerId) ?? null : null;

  if (statusChanged && NOTIFIABLE_STATUSES.has(status)) {
    sendOrderStatusWhatsApp(tenantId, order, status, customer);
  }

  return attachCustomer(orderResult, customerMap);
};

export const updateOrder = async (tenantId, id, data) => {
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const customerId = data.customerId === undefined ? undefined : await ensureCustomerExists(tenantId, data.customerId);
  const updateData = {
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.totalMinor !== undefined ? { totalMinor: data.totalMinor } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.items !== undefined ? { items: data.items } : {}),
    ...(data.measurements !== undefined ? { measurements: data.measurements } : {}),
    ...(data.customerId !== undefined ? { customerId } : {}),
  };

  const orderResult = await prisma.order.update({
    where: { id },
    data: updateData,
    select: orderSelect,
  });

  const customerMap = await loadCustomers(tenantId, [orderResult.customerId]);
  return attachCustomer(orderResult, customerMap);
};
