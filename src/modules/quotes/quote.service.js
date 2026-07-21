import { prisma } from '../../config/prisma.js';
import { NotFoundError } from '../../common/errors/index.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { pushEvent } from '../sse/sse.service.js';
import { logger } from '../../config/logger.js';
import { encryptMessage } from '../../common/utils/encryption.js';

const quoteSelect = {
  id: true,
  tenantId: true,
  customerId: true,
  conversationId: true,
  orderId: true,
  status: true,
  amountMinor: true,
  currency: true,
  details: true,
  createdAt: true,
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

export const listQuotes = async (tenantId, filters = {}) => {
  const where = { tenantId };
  if (filters.status) where.status = filters.status;
  if (filters.customerId) where.customerId = filters.customerId;

  const quotes = await prisma.quote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: quoteSelect,
  });

  const customerMap = await loadCustomers(tenantId, quotes.map((quote) => quote.customerId));
  return quotes.map((quote) => attachCustomer(quote, customerMap));
};

export const getQuote = async (tenantId, id) => {
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: quoteSelect,
  });

  if (!quote) {
    throw new NotFoundError('Quote not found');
  }

  const customerMap = await loadCustomers(tenantId, [quote.customerId]);
  return attachCustomer(quote, customerMap);
};

export const createQuote = async (tenantId, data) => {
  const customerId = await ensureCustomerExists(tenantId, data.customerId ?? null);
  const quote = await prisma.quote.create({
    data: {
      tenantId,
      customerId,
      conversationId: data.conversationId ?? null,
      status: 'draft',
      amountMinor: data.amountMinor,
      currency: data.currency,
      details: data.details ?? {},
    },
    select: quoteSelect,
  });

  const customerMap = await loadCustomers(tenantId, [quote.customerId]);
  const result = attachCustomer(quote, customerMap);

  // Send quote to customer via WhatsApp if we have their phone
  const phone = result.customer?.phone;
  if (phone) {
    const ref = quote.id.slice(0, 8).toUpperCase();
    const major = (quote.amountMinor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const desc = quote.details?.item || quote.details?.description || '';
    const lines = [
      `📋 *Quotation #${ref}*`,
      ...(desc ? [desc] : []),
      `Amount: *${quote.currency} ${major}*`,
      '',
      'Reply *YES* to confirm this order, or ask any questions.',
    ];
    try {
      const text = lines.join('\n');
      await sendMessage(tenantId, phone, text);
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'sent' } });
      result.status = 'sent';

      // Save the quote message into the conversation so it shows in the chat
      // like any other message, and push it live over SSE.
      if (quote.conversationId) {
        const message = await prisma.message.create({
          data: {
            conversationId: quote.conversationId,
            role: 'staff',
            content: encryptMessage(text),
            meta: { quoteId: quote.id },
          },
        });
        await prisma.conversation.update({ where: { id: quote.conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
        pushEvent(tenantId, 'staff_message', {
          conversationId: quote.conversationId,
          message: { id: message.id, role: 'staff', content: text, createdAt: message.createdAt },
        });
      }
    } catch (err) {
      logger.warn({ err: err.message, quoteId: quote.id }, '[quote] WhatsApp delivery failed — quote saved as draft');
    }
  }

  return result;
};

export const updateQuoteStatus = async (tenantId, id, status) => {
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { id: true, customerId: true },
  });

  if (!quote) {
    throw new NotFoundError('Quote not found');
  }

  const quoteResult = await prisma.quote.update({
    where: { id },
    data: { status }
  });

  const customerMap = await loadCustomers(tenantId, [quote.customerId]);
  return attachCustomer(quoteResult, customerMap);
};

export const updateQuote = async (tenantId, id, data) => {
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!quote) {
    throw new NotFoundError('Quote not found');
  }

  const customerId = data.customerId === undefined ? undefined : await ensureCustomerExists(tenantId, data.customerId);
  const updateData = {
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.amountMinor !== undefined ? { amountMinor: data.amountMinor } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.details !== undefined ? { details: data.details } : {}),
    ...(data.customerId !== undefined ? { customerId } : {}),
  };

  const quoteResult = await prisma.quote.update({
    where: { id },
    data: updateData,
    select: quoteSelect,
  });

  const customerMap = await loadCustomers(tenantId, [quoteResult.customerId]);
  return attachCustomer(quoteResult, customerMap);
};
