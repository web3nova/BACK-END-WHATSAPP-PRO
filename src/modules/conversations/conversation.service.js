import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { isQueueReady } from '../../config/redis.js';
import { NotFoundError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { notify } from '../notifications/notification.service.js';
import processAiReply from '../../jobs/processors/aiReply.job.js';

// Try to enqueue via BullMQ; if Redis is unavailable, run directly in-process.
// Upstash drops idle TCP connections every ~20s which can make BullMQ BLMOVE
// never return, so a direct fallback ensures replies still go out.
const enqueueOrRunAiReply = async (data, jobId) => {
  const opts = jobId
    ? { jobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    : { removeOnComplete: true };

  if (isQueueReady()) {
    try {
      await Promise.race([
        mainQueue.add('aiReply', data, opts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('enqueue timeout')), 800)),
      ]);
      logger.info({ conversationId: data.conversationId }, '[conversation] aiReply enqueued via BullMQ');
      return;
    } catch (err) {
      logger.warn({ err: err.message, conversationId: data.conversationId }, '[conversation] BullMQ enqueue failed — running aiReply in-process');
    }
  }

  setImmediate(() => {
    processAiReply({ data }).catch(e =>
      logger.error({ err: e.message, conversationId: data.conversationId }, '[conversation] in-process aiReply failed')
    );
  });
};

// Normalize phone to E.164 when possible; fall back to digits-preserving format.
const normalizePhone = (phone) => {
  if (!phone) return phone;
  try {
    const p = parsePhoneNumberFromString(phone);
    if (p && p.isValid && p.isValid()) return p.number; // E.164
  } catch (err) {
    // fallthrough to fallback normalizer
  }
  const keepPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/[^0-9]/g, '');
  return keepPlus ? `+${digits}` : digits;
};

/**
 * Handle an incoming WhatsApp message.
 * Resolves the tenant, saves the customer/conversation/message to Prisma,
 * and enqueues an aiReply job.
 */
export const handleIncomingMessage = async ({ phoneNumberId, senderPhone, senderName, text, messageId, media = [] }) => {
  // 0. Basic validations
  if (!phoneNumberId) {
    logger.error('[conversation] Missing phoneNumberId in payload');
    return;
  }

  // 1. Tenant Resolution
  logger.info({ phoneNumberId }, '[conversation] resolving tenant');
  const whatsappAccount = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
  if (!whatsappAccount) {
    logger.error({ phoneNumberId }, '[conversation] no tenant found for phoneNumberId');
    return;
  }
  const tenantId = whatsappAccount.tenantId;

  // 2. DB-level dedup — the message.externalId unique constraint is the source of truth.
  // Webhook retries send the same messageId; if already saved, skip silently.
  if (messageId) {
    const existing = await prisma.message.findUnique({ where: { externalId: messageId } });
    if (existing) {
      logger.info({ messageId }, '[conversation] duplicate message (db), skipping');
      return;
    }
  }

  const normalizedPhone = normalizePhone(senderPhone);

  // 3. Upsert customer
  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId, phone: normalizedPhone } },
    create: { tenantId, phone: normalizedPhone, name: senderName },
    update: { name: senderName || undefined }
  });

  // 4. Create conversation (if needed) + message in a single transaction.
  // The transaction is atomic so concurrent webhooks can't create duplicate conversations.
  const result = await prisma.$transaction(async (tx) => {
    let conversation = await tx.conversation.findFirst({
      where: { tenantId, customerId: customer.id, status: 'open' },
      orderBy: { updatedAt: 'desc' }
    });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: { tenantId, customerId: customer.id, channel: 'whatsapp', status: 'open' }
      });
    }

    const message = await tx.message.create({
      data: { conversationId: conversation.id, role: 'customer', content: text, externalId: messageId, meta: { whatsappMessageId: messageId } }
    });

    if (media && media.length) {
      for (const m of media) {
        try {
          await tx.mediaAsset.create({
            data: {
              tenantId,
              messageId: message.id,
              provider: m.provider || 'whatsapp',
              providerMediaId: m.providerMediaId,
              mimeType: m.mimeType,
              size: m.size,
              storageKey: m.storageKey,
              url: m.url,
              meta: m.meta || {},
            }
          });
        } catch (err) {
          logger.warn({ err: err?.message }, '[conversation] failed to persist media asset');
        }
      }
    }

    return { tenantId, conversationId: conversation.id, messageId: message.id };
  });

  logger.info({ conversationId: result.conversationId }, '[conversation] message saved');

  // 5. Trigger AI reply (BullMQ with in-process fallback)
  const jobId = messageId ? `aiReply:${messageId}` : undefined;
  await enqueueOrRunAiReply(result, jobId);

  // 6. In-app notification (fire and forget)
  const displayName = senderName || senderPhone || 'A customer';
  const preview = text ? (text.length > 60 ? text.slice(0, 57) + '…' : text) : 'Media message';
  notify(tenantId, {
    type: 'new_message',
    title: `New WhatsApp message from ${displayName}`,
    body: preview,
    metadata: { senderPhone, conversationId: result.conversationId },
    outbound: false,
  }).catch(() => {});
};

/**
 * List conversations for a tenant, include the customer and last message meta.
 */
export const listConversations = async (tenantId, { page = 1, limit = 25 } = {}) => {
  if (!tenantId) return { data: [], meta: { total: 0, page, limit } };
  const take = Math.min(limit, 100);
  const skip = Math.max(0, (page - 1) * take);

  const [total, conversations] = await prisma.$transaction([
    prisma.conversation.count({ where: { tenantId } }),
    prisma.conversation.findMany({
      where: { tenantId },
      include: { customer: true },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return { data: conversations, meta: { total, page, limit: take } };
};

/**
 * Return the message history for a conversation, enforcing tenant scoping.
 */
export const getConversationHistory = async (conversationId, tenantId, { page = 1, limit = 25 } = {}) => {
  if (!conversationId) return { data: [], meta: { total: 0, page, limit } };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.tenantId !== tenantId) {
    throw new NotFoundError('Conversation not found');
  }

  const take = Math.min(limit, 100);
  const skip = Math.max(0, (page - 1) * take);

  const [total, messages] = await prisma.$transaction([
    prisma.message.count({ where: { conversationId } }),
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, skip, take }),
  ]);

  return { data: messages, meta: { total, page, limit: take } };
};

/**
 * Resolve (close) a conversation. Only the owning tenant can resolve.
 */
export const resolveConversation = async (conversationId, tenantId) => {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.tenantId !== tenantId) throw new NotFoundError('Conversation not found');

  const updated = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'closed' } });
  return updated;
};
