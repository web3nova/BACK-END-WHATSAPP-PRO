// src/jobs/cartRecovery.cron.js
// Sweeps abandoned carts every 30 minutes and enqueues WhatsApp reminder jobs
// for carts idle past the merchant-configured delay. remindedAt is set BEFORE
// enqueueing so a retried/overlapping sweep can never double-send.

import cron from 'node-cron';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { mainQueue } from './queue.js';

const DEFAULT_CART_RECOVERY = { enabled: true, delayHours: 6 };

cron.schedule('*/30 * * * *', async () => {
  logger.info('[cron] running abandoned cart recovery sweep');
  try {
    const carts = await prisma.abandonedCart.findMany({
      where: { remindedAt: null, recoveredAt: null },
      include: {
        tenant: {
          include: {
            business: {
              include: { websiteSettings: true },
            },
          },
        },
      },
    });

    const now = Date.now();
    let sent = 0;

    for (const cart of carts) {
      const theme = cart.tenant?.business?.websiteSettings?.theme || {};
      const cartRecovery = { ...DEFAULT_CART_RECOVERY, ...(theme?.builder?.cartRecovery || {}) };

      if (!cartRecovery.enabled) continue;

      const dueAt = new Date(cart.lastActiveAt).getTime() + cartRecovery.delayHours * 3600000;
      if (dueAt > now) continue;

      await prisma.abandonedCart.update({
        where: { id: cart.id },
        data: { remindedAt: new Date() },
      });
      await mainQueue.add('cartRecovery', { cartId: cart.id });
      sent += 1;
    }

    logger.info({ sent }, '[cron] cart recovery reminders queued');
  } catch (err) {
    logger.error({ err: err.message }, '[cron] cart recovery sweep error');
  }
});

logger.info('[cron] abandoned cart recovery cron scheduled');
