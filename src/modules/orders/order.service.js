import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { notify } from '../notifications/notification.service.js';

const orderSelect = {
  id: true,
  tenantId: true,
  customerId: true,
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

export const createOrder = async (tenantId, data) => {
  const customerId = await ensureCustomerExists(tenantId, data.customerId ?? null);
  const order = await prisma.order.create({
    data: {
      tenantId,
      customerId,
      status: data.status,
      totalMinor: data.totalMinor,
      currency: data.currency,
      items: data.items ?? [],
      measurements: data.measurements ?? {},
    },
    select: orderSelect,
  });

  const customerMap = await loadCustomers(tenantId, [order.customerId]);
  const result = attachCustomer(order, customerMap);

  const amount = order.totalMinor ? `₦${(order.totalMinor / 100).toLocaleString()}` : '';
  const customerName = result.customer?.name || result.customer?.phone || 'A customer';
  notify(tenantId, {
    type: 'new_order',
    title: `New order from ${customerName}`,
    body: `Order ${amount ? `for ${amount} ` : ''}has been placed and is awaiting fulfillment.`,
    emailSubject: `New order received — ${amount || 'check your dashboard'}`,
    metadata: { orderId: order.id },
    outbound: true,
  }).catch(() => {});

  return result;
};

export const updateOrderStatus = async (tenantId, id, status) => {
  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, customerId: true },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const orderResult = await prisma.order.update({
    where: { id },
    data: { status }
  });

  const customerMap = await loadCustomers(tenantId, [order.customerId]);
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
