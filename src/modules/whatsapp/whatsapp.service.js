import * as conversationService from '../conversations/conversation.service.js';
import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { logger } from '../../config/logger.js';
import { fetchAndStoreMedia } from './media.service.js';
import { parseMessage, isMediaMessage, extractMediaId } from './whatsapp.parser.js';

/** Return the tenant's connected WhatsApp account (no access token). */
export const getAccount = async (tenantId) => {
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { id: true, wabaId: true, phoneNumberId: true, phoneNumber: true, verified: true },
  });
  return account ?? null;
};

/**
 * Process the incoming Meta Webhook payload asynchronously.
 * Extracts the messages and passes them to the conversation service.
 */
export const processIncoming = async (payload) => {
  if (!payload.entry) return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (!value || !value.messages) continue;

      const phoneNumberId = value.metadata?.phone_number_id;

      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i];
        const contact = value.contacts && value.contacts[i] ? value.contacts[i] : value.contacts[0];

        const senderPhone = message.from;
        const senderName = contact?.profile?.name || '';
        const { text } = parseMessage(message);

        logger.info({ senderPhone, phoneNumberId }, '[whatsapp] incoming message');

        const mediaAssets = [];
        try {
          const mediaId = extractMediaId(message);
          if (isMediaMessage(message.type) && mediaId) {
            const account = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
            if (account && account.accessToken) {
              const asset = await fetchAndStoreMedia({ tenantId: account.tenantId, mediaId, accessToken: account.accessToken });
              if (asset) mediaAssets.push(asset);
            }
          }
        } catch (err) {
          logger.warn({ err: err?.message }, '[whatsapp] failed to fetch/store media');
        }

        await conversationService.handleIncomingMessage({
          phoneNumberId,
          senderPhone,
          senderName,
          text,
          messageId: message.id,
          media: mediaAssets
        });
      }
    }
  }
};

/**
 * Create an outbox entry and enqueue background job to deliver it.
 * Returns the outbox DB row.
 */
export const sendMessage = async (tenantId, toPhone, payloadOrText) => {
  const payload = typeof payloadOrText === 'string' ? { type: 'text', body: payloadOrText } : payloadOrText;

  const outbox = await prisma.outboxMessage.create({
    data: {
      tenantId,
      to: toPhone,
      payload,
    }
  });

  // enqueue a job to deliver the outbox item (idempotent by jobId)
  await mainQueue.add('sendOutbox', { outboxId: outbox.id }, { jobId: outbox.id, removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 5000 } });

  return outbox;
};

