import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { pushEvent } from '../../modules/sse/sse.service.js';

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export default async function processAutoRelease(job) {
  const { conversationId } = job.data;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.status !== 'human') return;

  // Respect tenant's autoReply setting
  const business = await prisma.business.findUnique({
    where: { tenantId: conversation.tenantId },
    select: { settings: true },
  });
  if (business?.settings?.ai?.autoReply === false) {
    logger.info({ conversationId }, '[autoRelease] autoReply disabled — skipping release');
    return;
  }

  // Only release if staff has been inactive for the full window
  const lastStaffMsg = await prisma.message.findFirst({
    where: { conversationId, role: 'staff' },
    orderBy: { createdAt: 'desc' },
  });

  if (lastStaffMsg && Date.now() - new Date(lastStaffMsg.createdAt).getTime() < INACTIVITY_MS) {
    logger.info({ conversationId }, '[autoRelease] staff still active — skipping release');
    return;
  }

  await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'open' } });
  logger.info({ conversationId }, '[autoRelease] released back to AI after 30 min staff inactivity');

  pushEvent(conversation.tenantId, 'conversation_updated', { conversationId, status: 'open' });
}
