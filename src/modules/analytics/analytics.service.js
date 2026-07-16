import { prisma } from '../../config/prisma.js';

const VALID_DAYS = [7, 30, 90, 365];

function resolveDays(days) {
  const n = Number(days);
  return VALID_DAYS.includes(n) ? n : 7;
}

function dayLabel(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Day-span (inclusive) between two dates, e.g. Jan 1 -> Jan 1 is 1 day.
function daySpan(since, until) {
  const ms = until.setHours(0, 0, 0, 0) - new Date(since).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

// Everything the Analytics/Overview dashboard pages need for a date range —
// revenue/orders/top-products used to be computed client-side from a capped
// `listOrders({ limit: 200 })` fetch, silently undercounting past 200
// lifetime orders. Computed here instead, bounded by the actual date range
// rather than an arbitrary row count.
export async function getOverview(tenantId, query) {
  let days;
  let since;
  if (query.since) {
    since = new Date(query.since);
    since.setHours(0, 0, 0, 0);
    days = daySpan(since, new Date());
  } else {
    days = resolveDays(query.days);
    since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
  }

  // Each data source is independent — a problem with one (e.g. a table
  // temporarily unavailable) must not take down the metrics that have
  // nothing to do with it. Missing data degrades to zeros, not a 500.
  const [visitsResult, customersResult, messagesResult, allCustomersResult, ordersResult] = await Promise.allSettled([
    prisma.websiteVisit.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { source: true, createdAt: true },
    }),
    prisma.customer.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.message.findMany({
      where: { conversation: { tenantId }, createdAt: { gte: since }, role: { in: ['ai', 'staff'] } },
      select: { role: true },
    }),
    // Customer acquisition channel is a lifetime question, not scoped to the
    // selected date range — this is deliberately unfiltered by `since`.
    prisma.customer.findMany({
      where: { tenantId },
      select: { source: true },
    }),
    // Cancelled orders never happened — excluded so they can't inflate
    // revenue, order counts, or top-product sales. Every other status
    // (pending/confirmed/paid/fulfilled) still counts.
    prisma.order.findMany({
      where: { tenantId, createdAt: { gte: since }, status: { not: 'cancelled' } },
      select: { totalMinor: true, createdAt: true, items: true },
    }),
  ]);
  const visits = visitsResult.status === 'fulfilled' ? visitsResult.value : [];
  const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
  const messages = messagesResult.status === 'fulfilled' ? messagesResult.value : [];
  const allCustomers = allCustomersResult.status === 'fulfilled' ? allCustomersResult.value : [];
  const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];

  const dayKeys = Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    return d;
  });

  const dailyVisits = dayKeys.map((d) => ({
    day: dayLabel(d),
    visits: visits.filter((v) => sameDay(v.createdAt, d)).length,
  }));

  const customerGrowth = dayKeys.map((d) => ({
    day: dayLabel(d),
    count: customers.filter((c) => sameDay(c.createdAt, d)).length,
  }));

  const trafficSources = { whatsapp: 0, website: 0, referral: 0, direct: 0 };
  for (const v of visits) {
    if (v.source in trafficSources) trafficSources[v.source] += 1;
  }

  // Real customer acquisition channel (how they actually became a customer),
  // distinct from trafficSources above (storefront *visit* referrer stats —
  // near-zero for WhatsApp-first businesses since chatting the AI directly
  // never touches the storefront). Records from before this field existed
  // have source=null; bucket those as 'whatsapp' since that was the only
  // customer-creation path in this app prior to the storefront/checkout flow.
  const customerSources = { whatsapp: 0, website: 0, google: 0 };
  for (const c of allCustomers) {
    const key = c.source || 'whatsapp';
    if (key in customerSources) customerSources[key] += 1;
  }

  const messagesBySender = { ai: 0, staff: 0 };
  for (const m of messages) {
    if (m.role in messagesBySender) messagesBySender[m.role] += 1;
  }

  const revenue = orders.reduce((sum, o) => sum + (o.totalMinor || 0), 0);
  const orderCount = orders.length;

  const dailyRevenue = dayKeys.map((d) => {
    const dayOrders = orders.filter((o) => sameDay(o.createdAt, d));
    return {
      day: dayLabel(d),
      revenue: dayOrders.reduce((sum, o) => sum + (o.totalMinor || 0), 0),
      orders: dayOrders.length,
    };
  });

  const productCounts = {};
  for (const o of orders) {
    for (const item of o.items || []) {
      const id = item.productId || item.name || 'unknown';
      const name = item.name || item.productName || 'Unknown';
      if (!productCounts[id]) productCounts[id] = { name, sales: 0, revenue: 0 };
      productCounts[id].sales += item.quantity || 1;
      productCounts[id].revenue += (item.priceMinor || 0) * (item.quantity || 1);
    }
  }
  const topProducts = Object.values(productCounts).sort((a, b) => b.sales - a.sales).slice(0, 5);

  return {
    websiteVisits: { total: visits.length, daily: dailyVisits },
    trafficSources,
    customerSources,
    customerGrowth,
    messagesBySender,
    revenue,
    orderCount,
    dailyRevenue,
    topProducts,
  };
}
