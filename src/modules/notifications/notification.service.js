import { sendEmail } from './channels/email.channel.js';
import { sendWhatsApp } from './channels/whatsapp.channel.js';
import { sendSMS } from './channels/sms.channel.js';
import { logger } from '../../config/logger.js';

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

export default { send };
