import * as conversationService from '../conversations/conversation.service.js';

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

        await conversationService.handleIncomingMessage({
          phoneNumberId,
          senderPhone,
          senderName,
          text,
          messageId: message.id
        });
      }
    }
  }
};

/**
 * Send a message via Meta's WhatsApp Cloud API
 */
export const sendMessage = async (tenantId, toPhone, text) => {
  // We need the tenant's WhatsApp Account config (access token and phone number ID)
  // Usually this is fetched from the DB
  const { prisma } = await import('../../config/prisma.js');
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId }
  });

  if (!account || !account.accessToken || !account.phoneNumberId) {
    console.error(`[WhatsApp] Cannot send message, missing config for tenant ${tenantId}`);
    return;
  }

  const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}/${account.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'text',
    text: { body: text }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        console.log(`[WhatsApp] Message sent to ${toPhone}`);
        return data;
      }

      // Respect Retry-After if provided
      const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null;
      let waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;

      console.error(`[WhatsApp] Failed to send message (attempt ${attempt}):`, data);
      if (attempt < maxAttempts) {
        console.log(`[WhatsApp] Retrying in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      console.error(`[WhatsApp] Giving up sending message to ${toPhone} after ${attempt} attempts`);
      return data;
    } catch (error) {
      const waitMs = Math.pow(2, attempt) * 1000;
      console.error(`[WhatsApp] Network error sending message (attempt ${attempt}):`, error?.message || error);
      if (attempt < maxAttempts) {
        console.log(`[WhatsApp] Retrying in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
      console.error(`[WhatsApp] Giving up after ${attempt} attempts due to network errors`);
      throw error;
    }
  }
};

