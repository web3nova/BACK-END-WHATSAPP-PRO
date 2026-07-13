import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { prisma } from '../../config/prisma.js';

const orderSelect = {
  id: true, status: true, totalMinor: true, currency: true, items: true, measurements: true,
  createdAt: true, updatedAt: true,
};

export const getMyOrders = asyncHandler(async (req, res) => {
  if (!req.customer) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }
  const { id: customerId, tenantId } = req.customer;
  const orders = await prisma.order.findMany({
    where: { customerId, tenantId },
    orderBy: { createdAt: 'desc' },
    select: orderSelect,
  });
  ok(res, orders.map(o => {
    const m = o.measurements || {}
    return {
      id: o.id,
      reference: o.id.slice(0, 8).toUpperCase(),
      status: o.status,
      totalMinor: o.totalMinor,
      currency: o.currency,
      items: o.items,
      deliveryAddress: m.customerAddress || null,
      deliveryState: m.customerState || null,
      deliveryCity: m.customerCity || null,
      paymentMethod: m.paymentMethod || null,
      deliveryMethod: m.deliveryMethod || null,
      customerName: m.customerName || null,
      customerPhone: m.customerPhone || null,
      customerEmail: m.customerEmail || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }
  }));
});
