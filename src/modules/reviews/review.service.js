import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors/index.js';
import { paginate } from '../../common/utils/pagination.js';
import { findEligibleOrder } from './eligibility.js';

async function findOwnedProduct(productId, tenantId) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true, name: true },
  });
  if (!product) throw new NotFoundError('Product not found.');
  return product;
}

// Resolves a product's tenant without requiring caller auth — used by the
// fully-public review-listing endpoint, which has no tenant context.
export async function getProductTenantId(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, tenantId: true },
  });
  if (!product) throw new NotFoundError('Product not found.');
  return product.tenantId;
}

export async function getApprovedReviews(tenantId, productId, { page = 1, limit = 20 } = {}) {
  const { skip, take } = { skip: (page - 1) * limit, take: limit };
  const where = { tenantId, productId, status: 'approved' };

  const [items, total, aggregate] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.productReview.count({ where }),
    prisma.productReview.aggregate({
      where,
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  return {
    items,
    total,
    average: aggregate._avg.rating ?? null,
    count: aggregate._count,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

export async function checkEligibility(tenantId, customerId, productId) {
  const orders = await prisma.order.findMany({
    where: { tenantId, customerId, status: 'fulfilled' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, items: true },
  });

  const reviewed = await prisma.productReview.findMany({
    where: { tenantId, customerId, productId },
    select: { orderId: true },
  });
  const alreadyReviewedOrderIds = reviewed.map((r) => r.orderId);

  const orderId = findEligibleOrder(orders, productId, alreadyReviewedOrderIds);
  return { eligible: !!orderId, orderId };
}

export async function submitReview(tenantId, customerId, productId, { orderId, rating, text }) {
  const eligibility = await checkEligibility(tenantId, customerId, productId);
  if (!eligibility.eligible || eligibility.orderId !== orderId) {
    throw new BadRequestError('You are not eligible to review this product for this order');
  }

  try {
    return await prisma.productReview.create({
      data: {
        tenantId,
        productId,
        customerId,
        orderId,
        rating,
        text: text || null,
        status: 'pending',
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new BadRequestError('You have already reviewed this product for this order');
    }
    throw err;
  }
}

export async function listReviews(tenantId, { status, page, limit } = {}) {
  const { page: p, limit: l, skip } = paginate({ page, limit });
  const where = { tenantId, ...(status ? { status } : {}) };

  const [reviews, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: l,
    }),
    prisma.productReview.count({ where }),
  ]);

  const productIds = [...new Set(reviews.map((r) => r.productId))];
  const customerIds = [...new Set(reviews.map((r) => r.customerId))];

  const [products, customers] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
      : [],
    customerIds.length
      ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, phone: true } })
      : [],
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const items = reviews.map((r) => ({
    ...r,
    product: productMap.get(r.productId) ?? null,
    customer: customerMap.get(r.customerId) ?? null,
  }));

  return { items, meta: { total, page: p, limit: l, pages: Math.ceil(total / l) } };
}

async function findOwnedReview(id, tenantId) {
  const review = await prisma.productReview.findFirst({ where: { id, tenantId } });
  if (!review) throw new NotFoundError('Review not found.');
  return review;
}

export async function moderateReview(tenantId, id, status) {
  await findOwnedReview(id, tenantId);
  return prisma.productReview.update({ where: { id }, data: { status } });
}

export { findOwnedProduct };
