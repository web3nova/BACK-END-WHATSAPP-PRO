import { sendEmail } from './channels/email.channel.js';
import { sendWhatsApp } from './channels/whatsapp.channel.js';
import { sendSMS } from './channels/sms.channel.js';
import { logger } from '../../config/logger.js';
import { mainQueue } from '../../jobs/queue.js';
import { prisma } from '../../config/prisma.js';

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

// ── In-app notification store ──────────────────────────────────────────────

/**
 * Fire-and-forget: create an in-app notification for a tenant.
 * Call with .catch() or inside a non-blocking try/catch so it never throws
 * in the caller's critical path.
 */
export async function createInApp(tenantId, { type, title, body, metadata } = {}) {
  try {
    await prisma.notification.create({
      data: { tenantId, type, title, body, metadata: metadata ?? undefined },
    });
  } catch (err) {
    logger.warn({ err: err?.message, tenantId, type }, '[notification] failed to create in-app notification');
  }
}

export async function listForTenant(tenantId, { limit = 30 } = {}) {
  return prisma.notification.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUnreadCount(tenantId) {
  return prisma.notification.count({ where: { tenantId, read: false } });
}

export async function markAllRead(tenantId) {
  return prisma.notification.updateMany({ where: { tenantId, read: false }, data: { read: true } });
}

export async function markOneRead(tenantId, id) {
  return prisma.notification.updateMany({ where: { id, tenantId }, data: { read: true } });
}
