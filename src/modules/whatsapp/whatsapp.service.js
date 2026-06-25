import * as conversationService from '../conversations/conversation.service.js';
import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { fetchAndStoreMedia } from './media.service.js';

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

      // Some payloads might include multiple messages, though usually it's one.
      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i];
        const contact = value.contacts && value.contacts[i] ? value.contacts[i] : value.contacts[0];

        const senderPhone = message.from;
        const senderName = contact?.profile?.name || '';

        // Parse incoming message payloads, support text, interactive, and media
        let text = '';
        if (message.type === 'text') {
          text = message.text.body;
        } else if (message.type === 'interactive') {
          // interactive can be button replies or list replies
          const interactive = message.interactive;
          if (interactive.type === 'button_reply') {
            text = interactive.button_reply?.title || interactive.button_reply?.id || '';
          } else if (interactive.type === 'list_reply') {
            text = interactive.list_reply?.title || interactive.list_reply?.id || '';
          } else {
            text = `[Interactive message of type ${interactive.type}]`;
          }
        } else if (message.type === 'image' || message.type === 'audio' || message.type === 'video' || message.type === 'document') {
          // For media, capture the caption if present, otherwise note the media type
          const media = message[message.type];
          text = media?.caption || `[Received ${message.type} - media]`;
        } else if (message.type === 'sticker' || message.type === 'contacts' || message.type === 'location') {
          text = `[Received ${message.type} message]`;
        } else {
          text = `[Received ${message.type} message - unsupported by AI currently]`;
        }

        console.log(`[WhatsApp] Message from ${senderPhone} to ${phoneNumberId}: ${text}`);

        // If media present, attempt to download and store it (best-effort)
        const mediaAssets = [];
        try {
          if (message.type === 'image' || message.type === 'audio' || message.type === 'video' || message.type === 'document') {
            const mediaObj = message[message.type];
            const mediaId = mediaObj?.id;
            if (mediaId) {
              // lookup account to get tenant & access token
              const account = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
              if (account && account.accessToken) {
                const asset = await fetchAndStoreMedia({ tenantId: account.tenantId, mediaId, accessToken: account.accessToken });
                if (asset) mediaAssets.push(asset);
              }
            }
          }
        } catch (err) {
          console.warn('[WhatsApp] Failed to fetch/store media:', err?.message || err);
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

