import { sendEmail } from './channels/email.channel.js';
import { sendWhatsApp } from './channels/whatsapp.channel.js';
import { sendSMS } from './channels/sms.channel.js';
import { logger } from '../../config/logger.js';
import { mainQueue } from '../../jobs/queue.js';

/**
 * Send a notification via one or more channels.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {'email'|'whatsapp'|'sms'} params.channel
 * @param {string} params.to               - email address or phone number
 * @param {string} params.subject          - email subject (email channel only)
 * @param {string} params.text             - plain text / WhatsApp body
 * @param {string} [params.html]           - HTML body (email channel only)
 */
export async function send({ tenantId, channel, to, subject, text, html }) {
  try {
    switch (channel) {
      case 'email':
        await sendEmail({ to, subject, html: html || `<p>${text}</p>` });
        break;
      case 'whatsapp':
        await sendWhatsApp({ tenantId, to, text });
        break;
      case 'sms':
        await sendSMS({ to, text });
        break;
      default:
        logger.warn({ channel }, 'Unknown notification channel');
    }
  } catch (err) {
    logger.error({ err, channel, to, tenantId }, 'Notification dispatch failed');
    throw err;
  }
}

/**
 * Enqueue a notification for background delivery with retries.
 * Prefer this over calling send() directly in request handlers.
 */
export async function enqueue({ tenantId, channel, to, subject, text, html }) {
  await mainQueue.add(
    'sendNotification',
    { tenantId, channel, to, subject, text, html },
    { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 3000 } }
  );
}

export default { send, enqueue };
