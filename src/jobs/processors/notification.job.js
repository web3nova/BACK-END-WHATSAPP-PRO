import { send } from '../../modules/notifications/notification.service.js';
import { logger } from '../../config/logger.js';

export default async function processNotification(job) {
  const { tenantId, channel, to, subject, text, html } = job.data;

  if (!channel || !to || !text) {
    throw new Error(`[notification.job] Missing required fields: channel=${channel}, to=${to}`);
  }

  logger.info({ tenantId, channel, to }, '[notification.job] Dispatching notification');
  await send({ tenantId, channel, to, subject, text, html });
  logger.info({ tenantId, channel, to }, '[notification.job] Notification sent');
}
