import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { NotFoundError } from '../../common/errors/index.js';
import { redis } from '../../config/redis.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import crypto from 'crypto';

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
    console.error('[Conversation Service] Missing phoneNumberId in payload');
    return;
  }

  // Deduplicate by external message id using Redis lock to guard against webhook retries
  if (messageId) {
    try {
      const lockKey = `whatsapp:msg:${phoneNumberId}:${messageId}`;
      // NX = set if not exists, EX = expire seconds
      const locked = await redis.set(lockKey, '1', 'EX', 60, 'NX');
      if (!locked) {
        console.log(`[Conversation Service] Duplicate message lock for ${messageId}, skipping processing.`);
        return;
      }
    } catch (err) {
      console.warn('[Conversation Service] Redis lock error, continuing without lock', err?.message || err);
    }
  }

  // 1. Tenant Resolution
  const whatsappAccount = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
  if (!whatsappAccount) {
    console.error(`[Conversation Service] No tenant found for phone_number_id: ${phoneNumberId}`);
    return;
  }
  const tenantId = whatsappAccount.tenantId;

  // Normalize phone for lookups and storage
  const normalizedPhone = normalizePhone(senderPhone);

  // Quick DB-level dedupe by externalId (if present)
  if (messageId) {
    const existing = await prisma.message.findUnique({ where: { externalId: messageId } });
    if (existing) {
      // verify tenant ownership via conversation
      const parentConv = await prisma.conversation.findUnique({ where: { id: existing.conversationId } });
      if (parentConv?.tenantId === tenantId) {
        console.log(`[Conversation Service] Message ${messageId} already processed (db), skipping.`);
        return;
      }
      console.warn(`[Conversation Service] externalId ${messageId} already exists but tenant mismatch`);
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
          // best-effort: log but don't fail the whole transaction for media record errors
          console.warn('[Conversation Service] Failed to persist media asset', err?.message || err);
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
    console.warn('[Conversation Service] Conversation lock attempt failed', err?.message || err);
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
      await mainQueue.add('aiReply', { tenantId, conversationId: existing.id, messageId: msg.id }, jobId ? { jobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } } : { removeOnComplete: true });

      console.log(`[Conversation Service] Saved message and enqueued aiReply for existing conversation: ${existing.id}`);
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
      await mainQueue.add('aiReply', { tenantId: result.tenantId, conversationId: result.conversationId, messageId: result.messageId }, jobId ? { jobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } } : { removeOnComplete: true });

      console.log(`[Conversation Service] Saved message and enqueued aiReply for conversation: ${result.conversationId}`);
      return;
    } finally {
      try {
        const cur = await redis.get(convLockKey);
        if (cur === lockId) await redis.del(convLockKey);
      } catch (err) {
        console.warn('[Conversation Service] Failed to release conversation lock', err?.message || err);
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
          console.warn('[Conversation Service] Failed to persist media asset (fallback path)', err?.message || err);
        }
      }
    }
    return { tenantId, conversationId: conversation.id, messageId: message.id };
  });

  const fallbackJobId = messageId ? `aiReply:${messageId}` : undefined;
  await mainQueue.add('aiReply', { tenantId: fallbackResult.tenantId, conversationId: fallbackResult.conversationId, messageId: fallbackResult.messageId }, fallbackJobId ? { jobId: fallbackJobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } } : { removeOnComplete: true });
  console.log(`[Conversation Service] Saved message (fallback) and enqueued aiReply for conversation: ${fallbackResult.conversationId}`);
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
