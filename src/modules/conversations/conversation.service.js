import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { NotFoundError } from '../../common/errors/index.js';
import { redis } from '../../config/redis.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

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
export const handleIncomingMessage = async ({ phoneNumberId, senderPhone, senderName, text, messageId }) => {
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

  // 2..4. Create or find customer, conversation and message inside a transaction
  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: normalizedPhone } },
      create: { tenantId, phone: normalizedPhone, name: senderName },
      update: { name: senderName || undefined }
    });

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
      data: {
        conversationId: conversation.id,
        role: 'customer',
        content: text,
        externalId: messageId,
        meta: { whatsappMessageId: messageId }
      }
    });

    return { tenantId, conversationId: conversation.id, messageId: message.id };
  });

  // 5. Enqueue the AI Reply Job (outside the DB transaction)
  // Use message external id as the jobId to dedupe jobs on the queue layer
  const jobId = messageId ? `aiReply:${messageId}` : undefined;
  await mainQueue.add('aiReply', {
    tenantId: result.tenantId,
    conversationId: result.conversationId,
    messageId: result.messageId
  }, jobId ? { jobId, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } } : { removeOnComplete: true });

  console.log(`[Conversation Service] Saved message and enqueued aiReply for conversation: ${result.conversationId}`);
};
