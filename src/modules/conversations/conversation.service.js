import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { NotFoundError } from '../../common/errors/index.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import crypto from 'crypto';
import { notify } from '../notifications/notification.service.js';
import processAiReply from '../../jobs/processors/aiReply.job.js';

// Try to enqueue via BullMQ; if Redis is unavailable, run directly in-process.
// Upstash drops idle TCP connections every ~20s which can make BullMQ BLMOVE
// never return, so a direct fallback ensures replies still go out.
const enqueueOrRunAiReply = async (data, jobId) => {
  const opts = jobId
    ? { jobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    : { removeOnComplete: true };
  try {
    await Promise.race([
      mainQueue.add('aiReply', data, opts),
      new Promise((_, reject) => setTimeout(() => reject(new Error('enqueue timeout')), 3000)),
    ]);
    logger.info({ conversationId: data.conversationId }, '[conversation] aiReply enqueued via BullMQ');
  } catch (err) {
    logger.warn({ err: err.message, conversationId: data.conversationId }, '[conversation] BullMQ enqueue failed — running aiReply in-process');
    setImmediate(() => {
      processAiReply({ data }).catch(e =>
        logger.error({ err: e.message, conversationId: data.conversationId }, '[conversation] in-process aiReply failed')
      );
    });
  }
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

  // Deduplicate by external message id using Redis lock to guard against webhook retries
  const dedupLockKey = messageId ? `whatsapp:msg:${phoneNumberId}:${messageId}` : null;
  if (dedupLockKey) {
    try {
      const locked = await redis.set(dedupLockKey, '1', 'EX', 60, 'NX');
      if (!locked) {
        logger.info({ messageId }, '[conversation] duplicate message — already processing, skipping');
        return;
      }
    } catch (err) {
      logger.warn({ err: err?.message }, '[conversation] Redis lock error, continuing without lock');
    }
  }

  // 1. Tenant Resolution
  logger.info({ phoneNumberId }, '[conversation] resolving tenant');
  const whatsappAccount = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
  if (!whatsappAccount) {
    logger.error({ phoneNumberId }, '[conversation] no tenant found for phoneNumberId');
    return;
  }
  const tenantId = whatsappAccount.tenantId;
  logger.info({ tenantId }, '[conversation] tenant resolved');

  // Normalize phone for lookups and storage
  const normalizedPhone = normalizePhone(senderPhone);

  // Quick DB-level dedupe by externalId (if present)
  if (messageId) {
    const existing = await prisma.message.findUnique({ where: { externalId: messageId } });
    if (existing) {
      // verify tenant ownership via conversation
      const parentConv = await prisma.conversation.findUnique({ where: { id: existing.conversationId } });
      if (parentConv?.tenantId === tenantId) {
        logger.debug({ messageId }, '[conversation] message already processed (db), skipping');
        return;
      }
      logger.warn({ messageId }, '[conversation] externalId already exists but tenant mismatch');
    }
  }

  // 2. Ensure Customer exists (upsert outside the conversation lock)
  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId, phone: normalizedPhone } },
    create: { tenantId, phone: normalizedPhone, name: senderName },
    update: { name: senderName || undefined }
  });

  // helper to create a message and associated media assets using the provided DB client (prisma or transaction)
  const createMessageAndAssets = async (db, conversationId, content, externalId, mediaArr = []) => {
    const msg = await db.message.create({ data: { conversationId, role: 'customer', content, externalId, meta: { whatsappMessageId: externalId } } });
    if (mediaArr && mediaArr.length) {
      for (const m of mediaArr) {
        try {
          await db.mediaAsset.create({
            data: {
              tenantId,
              messageId: msg.id,
              provider: m.provider || 'whatsapp',
              providerMediaId: m.providerMediaId,
              mimeType: m.mimeType,
              size: m.size,
              storageKey: m.storageKey,
              url: m.url,
              meta: m.meta || {}
            }
          });
        } catch (err) {
          logger.warn({ err: err?.message }, '[conversation] failed to persist media asset');
        }
      }
    }
    return msg;
  };

  // 3. Acquire a short Redis lock per customer to avoid concurrent conversation creation
  const convLockKey = `whatsapp:conv:${tenantId}:${customer.id}`;
  const lockId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const lockExpire = 10; // seconds
  let lockAcquired = false;
  try {
    const lockRes = await redis.set(convLockKey, lockId, 'NX', 'EX', lockExpire);
    if (lockRes) lockAcquired = true;
  } catch (err) {
    logger.warn({ err: err?.message }, '[conversation] conversation lock attempt failed');
  }

  // If lock not acquired, attempt a short-poll to find an existing open conversation
  if (!lockAcquired) {
    const existing = await prisma.conversation.findFirst({
      where: { tenantId, customerId: customer.id, status: 'open' },
      orderBy: { updatedAt: 'desc' }
    });
    if (existing) {
      // Create message attached to the existing conversation
      const msg = await createMessageAndAssets(prisma, existing.id, text, messageId, media);

      const jobId = messageId ? `aiReply:${messageId}` : undefined;
      await enqueueOrRunAiReply({ tenantId, conversationId: existing.id, messageId: msg.id }, jobId);
      logger.info({ conversationId: existing.id }, '[conversation] message saved, aiReply triggered (existing conversation)');
      return;
    }
    // If no existing conversation found, try to acquire lock with retries
    const maxAttempts = 5;
    for (let i = 0; i < maxAttempts && !lockAcquired; i++) {
      try {
        const tryLock = await redis.set(convLockKey, lockId, 'NX', 'EX', lockExpire);
        if (tryLock) {
          lockAcquired = true;
          break;
        }
      } catch (err) {
        // ignore and retry
      }
      // small backoff
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // 4. With lock acquired: create/find conversation and create message inside transaction
  if (lockAcquired) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        let conversation = await tx.conversation.findFirst({
          where: { tenantId, customerId: customer.id, status: 'open' },
          orderBy: { updatedAt: 'desc' }
        });

        if (!conversation) {
          conversation = await tx.conversation.create({ data: { tenantId, customerId: customer.id, channel: 'whatsapp', status: 'open' } });
        }

        const message = await createMessageAndAssets(tx, conversation.id, text, messageId, media);
        return { tenantId, conversationId: conversation.id, messageId: message.id };
      });

      const jobId = messageId ? `aiReply:${messageId}` : undefined;
      await enqueueOrRunAiReply({ tenantId: result.tenantId, conversationId: result.conversationId, messageId: result.messageId }, jobId);

      const displayName = senderName || senderPhone || 'A customer';
      const preview = text ? (text.length > 60 ? text.slice(0, 57) + '…' : text) : 'Media message';
      notify(tenantId, {
        type: 'new_message',
        title: `New WhatsApp message from ${displayName}`,
        body: preview,
        metadata: { senderPhone, conversationId: result.conversationId },
        outbound: false, // too noisy to email every message — in-app only
      }).catch(() => {});

      logger.info({ conversationId: result.conversationId }, '[conversation] message saved, aiReply enqueued');
      return;
    } finally {
      try {
        const cur = await redis.get(convLockKey);
        if (cur === lockId) await redis.del(convLockKey);
      } catch (err) {
        logger.warn({ err: err?.message }, '[conversation] failed to release conversation lock');
      }
    }
  }

  // 5. Fallback: if we couldn't acquire lock after retries, try to create message against a new/last conversation
  const fallbackResult = await prisma.$transaction(async (tx) => {
    const customerTx = await tx.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: normalizedPhone } },
      create: { tenantId, phone: normalizedPhone, name: senderName },
      update: { name: senderName || undefined }
    });

    let conversation = await tx.conversation.findFirst({ where: { tenantId, customerId: customerTx.id, status: 'open' }, orderBy: { updatedAt: 'desc' } });
    if (!conversation) {
      conversation = await tx.conversation.create({ data: { tenantId, customerId: customerTx.id, channel: 'whatsapp', status: 'open' } });
    }

    const message = await tx.message.create({ data: { conversationId: conversation.id, role: 'customer', content: text, externalId: messageId, meta: { whatsappMessageId: messageId } } });
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
              meta: m.meta || {}
            }
          });
        } catch (err) {
          logger.warn({ err: err?.message }, '[conversation] failed to persist media asset (fallback path)');
        }
      }
    }
    return { tenantId, conversationId: conversation.id, messageId: message.id };
  });

  const fallbackJobId = messageId ? `aiReply:${messageId}` : undefined;
  await enqueueOrRunAiReply({ tenantId: fallbackResult.tenantId, conversationId: fallbackResult.conversationId, messageId: fallbackResult.messageId }, fallbackJobId);
  logger.info({ conversationId: fallbackResult.conversationId }, '[conversation] message saved (fallback), aiReply triggered');
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
