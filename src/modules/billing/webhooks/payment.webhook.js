import { getPlanLimits } from '../../../common/constants/plans.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../config/logger.js';

// This handler is mounted at POST /billing/webhook
// It receives events from your payment provider (Paystack/Flutterwave)
// and updates the subscription accordingly.
// Dev 4 wires the actual payment gateway — this just reacts to events.

export const handlePaymentWebhook = async (req, res) => {
  const event = req.body;

  logger.info(`[billing webhook] event received: ${event.event}`);

  try {
    switch (event.event) {
      case 'subscription.create':
      case 'charge.success': {
        const { tenantId, plan } = event.data.metadata ?? {};
        if (!tenantId || !plan) break;

        await prisma.subscription.upsert({
          where: { tenantId },
          update: { plan, status: 'active', renewsAt: event.data.paid_at ? new Date(event.data.paid_at) : null },
          create: { tenantId, plan, status: 'active' },
        });

        logger.info(`[billing webhook] subscription activated: tenant=${tenantId} plan=${plan}`);
        break;
      }

      case 'subscription.disable':
      case 'invoice.payment_failed': {
        const { tenantId } = event.data.metadata ?? {};
        if (!tenantId) break;

        await prisma.subscription.updateMany({
          where: { tenantId },
          data: { status: 'past_due' },
        });

        logger.warn(`[billing webhook] subscription past_due: tenant=${tenantId}`);
        break;
      }

      case 'subscription.not_renew': {
        const { tenantId } = event.data.metadata ?? {};
        if (!tenantId) break;

        await prisma.subscription.updateMany({
          where: { tenantId },
          data: { status: 'cancelled' },
        });

        logger.info(`[billing webhook] subscription cancelled: tenant=${tenantId}`);
        break;
      }

      default:
        logger.info(`[billing webhook] unhandled event: ${event.event}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error(`[billing webhook] error: ${err.message}`);
    return res.status(500).json({ received: false });
  }
};