import { prisma } from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { sendMessage } from '../../modules/whatsapp/whatsapp.service.js';

export default async function processCartRecovery(job) {
  const { cartId } = job.data;

  const cart = await prisma.abandonedCart.findUnique({
    where: { id: cartId },
    include: { customer: true, tenant: { include: { business: true } } },
  });

  if (!cart) {
    logger.info({ cartId }, '[cartRecovery.job] cart no longer exists — skipping');
    return;
  }

  // Race: an order may have been placed (recoveredAt/deletion via cart-ping)
  // between the sweep marking remindedAt and this job running.
  if (cart.recoveredAt) {
    logger.info({ cartId }, '[cartRecovery.job] cart already recovered — skipping');
    return;
  }

  if (cart.customer?.meta?.cartRemindersOptedOut) {
    logger.info({ cartId }, '[cartRecovery.job] customer opted out of cart reminders — skipping');
    return;
  }

  const { tenant, customer } = cart;
  const businessName = tenant?.business?.displayName || tenant?.name || 'our store';
  const url = `${config.frontendUrl}${tenant.slug ? `/b/${tenant.slug}` : `/storefront/${tenant.id}`}?utm_source=whatsapp`;

  const message = `🛒 You left items in your cart at ${businessName}! Come back and check out: ${url}\n\nReply STOP to stop these reminders.`;

  await sendMessage(tenant.id, customer.phone, message);
  logger.info({ cartId, tenantId: tenant.id }, '[cartRecovery.job] reminder sent');
}
