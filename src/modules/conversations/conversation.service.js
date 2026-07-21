import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { NotFoundError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { notify } from '../notifications/notification.service.js';
import { pushEvent } from '../sse/sse.service.js';
import processAiReply from '../../jobs/processors/aiReply.job.js';
import { encryptMessage, decryptMessage } from '../../common/utils/encryption.js';

// Enqueue via pg-boss (Postgres-backed, always available). Falls back to
// in-process only if the enqueue itself fails (e.g. DB unreachable).
const enqueueOrRunAiReply = async (data, jobId) => {
  const opts = jobId
    ? { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    : {};
  try {
    await mainQueue.add('aiReply', data, opts);
    logger.info({ conversationId: data.conversationId }, '[conversation] aiReply enqueued via pg-boss');
  } catch (err) {
    logger.warn({ err: err.message, conversationId: data.conversationId }, '[conversation] pg-boss enqueue failed — running aiReply in-process');
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
export const handleIncomingMessage = async ({ phoneNumberId, senderPhone, senderName, text, messageId, media = [], structured }) => {
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
    create: { tenantId, phone: normalizedPhone, name: senderName, source: 'whatsapp' },
    update: { name: senderName || undefined }
  });

  // 3b. Hardcoded STOP keyword — opt the customer out of cart reminders and
  // short-circuit the rest of the message pipeline (no AI reply, no
  // conversation/message persistence for this one message).
  if (text && text.trim().toUpperCase() === 'STOP') {
    const meta = { ...(customer.meta || {}), cartRemindersOptedOut: true };
    await prisma.customer.update({ where: { id: customer.id }, data: { meta } });
    // Dynamic import — matches this file's existing pattern for calling into
    // whatsapp.service.js, which itself imports this file (circular).
    import('../whatsapp/whatsapp.service.js').then(({ sendMessage }) =>
      sendMessage(tenantId, normalizedPhone, "You've been unsubscribed from cart reminders.")
    ).catch(() => {});
    logger.info({ tenantId, customerId: customer.id }, '[conversation] customer opted out of cart reminders via STOP');
    return;
  }

  // 4. Create conversation (if needed) + message in a single transaction.
  // The transaction is atomic so concurrent webhooks can't create duplicate conversations.
  const result = await prisma.$transaction(async (tx) => {
    // Find the most recent conversation regardless of status.
    // If closed/escalated, reopen it so the same customer never gets a duplicate chat.
    let conversation = await tx.conversation.findFirst({
      where: { tenantId, customerId: customer.id },
      orderBy: { updatedAt: 'desc' }
    });
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: { tenantId, customerId: customer.id, channel: 'whatsapp', status: 'open' }
      });
    } else if (conversation.status === 'closed' || conversation.status === 'escalated') {
      // Reopen closed/escalated conversations on new customer message.
      // 'human' stays as-is — staff is actively handling it.
      conversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: { status: 'open' }
      });
    }

    const message = await tx.message.create({
      data: { conversationId: conversation.id, role: 'customer', content: encryptMessage(text), externalId: messageId, meta: { whatsappMessageId: messageId, ...(structured && { structured }) } }
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

  // Push live update to any connected dashboard tabs for this tenant
  pushEvent(tenantId, 'new_message', {
    conversationId: result.conversationId,
    message: {
      id: result.messageId,
      role: 'customer',
      content: text,
      createdAt: new Date().toISOString(),
      media: (media || []).map((m) => ({ mimeType: m.mimeType, url: m.url })),
      meta: structured ? { structured } : undefined,
    },
    senderPhone,
    senderName,
  });

  // 5. Trigger AI reply (pg-boss with in-process fallback)
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
      include: {
        customer: true,
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  // Preview text for the conversation list — same "what to show" logic as
  // conversation.controller's notify() preview, so the list row and the
  // in-app notification never disagree about what the last message said.
  const data = conversations.map(({ messages, ...conv }) => {
    const [last] = messages;
    if (!last) return { ...conv, lastMessage: null };
    const content = decryptMessage(last.content)?.trim();
    return {
      ...conv,
      lastMessage: {
        role: last.role,
        content: content || (last.role === 'customer' ? 'Sent an attachment' : 'Sent a message'),
        createdAt: last.createdAt,
      },
    };
  });

  return { data, meta: { total, page, limit: take } };
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

  // Ordered newest-first so page 1 (skip=0) is always the most recent `take`
  // messages, then reversed back to chronological order for display below.
  // Fetching oldest-first meant any conversation past `take` messages could
  // never show anything newer than message #`take` on a fresh load — the
  // most recent messages were silently unreachable, not just slow to load.
  const [total, messages] = await prisma.$transaction([
    prisma.message.count({ where: { conversationId } }),
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        mediaAssets: true,
        senderUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);
  messages.reverse();

  // Stored media URLs are signed with a 1h expiry — re-sign on every read so
  // images/videos in chat history never break.
  const { storage } = await import('../../config/storage.js');
  const data = await Promise.all(messages.map(async (m) => {
    const sender = m.senderUser ? { name: m.senderUser.name, email: m.senderUser.email } : null;
    const { senderUser, ...rest } = m;
    rest.content = decryptMessage(rest.content);
    if (!m.mediaAssets?.length) return { ...rest, sender };
    const media = await Promise.all(m.mediaAssets.map(async (a) => {
      let url = a.url;
      try { url = await storage.getSignedUrl(a.storageKey); } catch { /* keep stored url */ }
      return { id: a.id, mimeType: a.mimeType, url };
    }));
    return { ...rest, media, sender };
  }));

  return { data, meta: { total, page, limit: take } };
};

const STAFF_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Staff takes over a conversation — AI will not reply until released.
 */
export const takeOver = async (conversationId, tenantId) => {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.tenantId !== tenantId) throw new NotFoundError('Conversation not found');

  const updated = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'human' } });

  // Schedule auto-release after 30 min of inactivity (singleton — one per conversation)
  await mainQueue.add('autoRelease', { conversationId }, {
    jobId: `autoRelease:${conversationId}`,
    startAfterMs: STAFF_INACTIVITY_MS,
  });

  pushEvent(tenantId, 'conversation_updated', { conversationId, status: 'human' });
  return updated;
};

/**
 * Release conversation back to AI.
 */
export const release = async (conversationId, tenantId) => {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.tenantId !== tenantId) throw new NotFoundError('Conversation not found');

  const updated = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'open' } });
  pushEvent(tenantId, 'conversation_updated', { conversationId, status: 'open' });
  return updated;
};

/**
 * Staff sends a message to a customer directly (e.g. from the Customers page,
 * where there's a customerId but no conversationId in hand). Resolves to the
 * customer's most recent conversation — reopening it if closed/escalated, or
 * creating one if none exists — then delegates to sendStaffMessage so every
 * staff-initiated WhatsApp send is persisted and visible in the inbox, not
 * just the ones sent from the WhatsApp page itself.
 */
export const sendStaffMessageByCustomer = async (customerId, tenantId, text, senderUserId = null) => {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError('Customer not found');

  let conversation = await prisma.conversation.findFirst({
    where: { tenantId, customerId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { tenantId, customerId, channel: 'whatsapp', status: 'human' },
    });
  } else if (conversation.status === 'closed' || conversation.status === 'escalated') {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'human' },
    });
  }

  return sendStaffMessage(conversation.id, tenantId, text, senderUserId);
};

/**
 * Staff sends a message inside a conversation.
 * Saves to DB and sends via WhatsApp. Resets the auto-release timer.
 */
export const sendStaffMessage = async (conversationId, tenantId, text, senderUserId = null) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conv || conv.tenantId !== tenantId) throw new NotFoundError('Conversation not found');

  const message = await prisma.message.create({
    data: { conversationId, role: 'staff', content: encryptMessage(text), senderUserId },
    include: { senderUser: { select: { id: true, name: true, email: true } } },
  });

  // Send via WhatsApp
  const { sendMessage } = await import('../whatsapp/whatsapp.service.js');
  await sendMessage(tenantId, conv.customer.phone, text);

  // Reset the auto-release timer
  await mainQueue.add('autoRelease', { conversationId }, {
    jobId: `autoRelease:${conversationId}`,
    startAfterMs: STAFF_INACTIVITY_MS,
  });

  pushEvent(tenantId, 'staff_message', {
    conversationId,
    message: {
      id: message.id, role: 'staff', content: text, createdAt: message.createdAt,
      sender: message.senderUser ? { name: message.senderUser.name, email: message.senderUser.email } : null,
    },
  });

  const { senderUser, ...rest } = message;
  return { ...rest, content: text, sender: senderUser ? { name: senderUser.name, email: senderUser.email } : null };
};

/**
 * Staff sends an image/video/document inside a conversation.
 * Uploads to storage, delivers via WhatsApp media message, records in chat.
 */
export const sendStaffMedia = async (conversationId, tenantId, file, caption = '', senderUserId = null) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conv || conv.tenantId !== tenantId) throw new NotFoundError('Conversation not found');

  const { storage } = await import('../../config/storage.js');
  const mime = file.mimetype || 'application/octet-stream';
  const mediaType = mime.startsWith('image/') ? 'image'
    : mime.startsWith('video/') ? 'video'
    : mime.startsWith('audio/') ? 'audio'
    : 'document';

  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf' };
  const ext = extMap[mime] || (mime.split('/')[1] || 'bin');
  const key = `whatsapp/${tenantId}/outbound/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await storage.put(key, file.buffer, mime);
  // WhatsApp needs a long enough validity to fetch the media
  const url = await storage.getSignedUrl(key, 60 * 60 * 24);

  const message = await prisma.message.create({
    data: { conversationId, role: 'staff', content: encryptMessage(caption || ''), senderUserId },
    include: { senderUser: { select: { id: true, name: true, email: true } } },
  });
  await prisma.mediaAsset.create({
    data: {
      tenantId,
      messageId: message.id,
      provider: 'upload',
      mimeType: mime,
      size: file.size,
      storageKey: key,
      url,
    },
  });

  const { sendMessage } = await import('../whatsapp/whatsapp.service.js');
  await sendMessage(tenantId, conv.customer.phone, {
    type: 'media',
    mediaType,
    url,
    storageKey: key,
    caption: caption || undefined,
  });

  await mainQueue.add('autoRelease', { conversationId }, {
    jobId: `autoRelease:${conversationId}`,
    startAfterMs: STAFF_INACTIVITY_MS,
  });

  const payload = {
    id: message.id,
    role: 'staff',
    content: caption || '',
    createdAt: message.createdAt,
    media: [{ mimeType: mime, url }],
    sender: message.senderUser ? { name: message.senderUser.name, email: message.senderUser.email } : null,
  };
  pushEvent(tenantId, 'staff_message', { conversationId, message: payload });

  return payload;
};
