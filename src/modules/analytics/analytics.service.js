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

// Everything the Analytics dashboard page needs beyond what it already
// computes client-side from orders (revenue/orders/top-products stay as-is).
export async function getOverview(tenantId, query) {
  const days = resolveDays(query.days);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  // Each data source is independent — a problem with one (e.g. a table
  // temporarily unavailable) must not take down the metrics that have
  // nothing to do with it. Missing data degrades to zeros, not a 500.
  const [visitsResult, customersResult, messagesResult, allCustomersResult] = await Promise.allSettled([
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
  ]);
  const visits = visitsResult.status === 'fulfilled' ? visitsResult.value : [];
  const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
  const messages = messagesResult.status === 'fulfilled' ? messagesResult.value : [];
  const allCustomers = allCustomersResult.status === 'fulfilled' ? allCustomersResult.value : [];

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

  return {
    websiteVisits: { total: visits.length, daily: dailyVisits },
    trafficSources,
    customerSources,
    customerGrowth,
    messagesBySender,
  };
}
