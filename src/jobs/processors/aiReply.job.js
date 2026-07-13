import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import aiService from '../../modules/ai/ai.service.js';
import * as whatsappService from '../../modules/whatsapp/whatsapp.service.js';
import { notify } from '../../modules/notifications/notification.service.js';
import { pushEvent } from '../../modules/sse/sse.service.js';
import { escalationEmail } from '../../config/emailTemplates.js';

export default async function processAiReply(job) {
  const { tenantId, conversationId, messageId } = job.data;

  // 1. Fetch conversation to get customer details and message content
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true }
  });

  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!conversation || !message) {
    throw new Error('Conversation or Message not found');
  }

  // If conversation is escalated or closed, AI shouldn't reply automatically
  if (conversation.status !== 'open') {
    logger.info({ conversationId, status: conversation.status }, '[aiReply] conversation not open, skipping');
    return;
  }

  // Respect the tenant's AI auto-reply toggle
  const business = await prisma.business.findUnique({ where: { tenantId }, select: { settings: true } });
  const autoReply = business?.settings?.ai?.autoReply;
  if (autoReply === false) {
    logger.info({ tenantId }, '[aiReply] auto-reply disabled by tenant settings, skipping');
    return;
  }

  // Idempotency: if an AI reply for this message already exists, skip
  if (messageId) {
    const existingAi = await prisma.message.findFirst({
      where: { conversationId, role: 'ai', meta: { path: ['aiForMessageId'], equals: messageId } }
    });
    if (existingAi) {
      logger.info({ messageId }, '[aiReply] AI reply already exists, skipping');
      return;
    }
  }

  // 2. Call the AI Service
  logger.info({ conversationId }, '[aiReply] triggering AI');
  let aiResponse;
  try {
    aiResponse = await aiService.chat({
      tenantId,
      conversationId,
      customerId: conversation.customerId,
      message: message.content
    });
  } catch (err) {
    logger.error({ err: err?.message, conversationId }, '[aiReply] AI service failed, escalating');

    const fallback = 'Sorry, I could not process your message right now. A human will reply shortly.';
    const fallbackMessage = await prisma.message.create({ data: { conversationId, role: 'ai', content: fallback, meta: { aiForMessageId: messageId } } });
    pushEvent(tenantId, 'ai_message', {
      conversationId,
      message: { id: fallbackMessage.id, role: 'ai', content: fallback, createdAt: fallbackMessage.createdAt },
    });

    try {
      await whatsappService.sendMessage(tenantId, conversation.customer.phone, fallback);
    } catch (sendErr) {
      logger.error({ err: sendErr?.message }, '[aiReply] failed to send fallback message');
    }

    try {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'escalated' } });
    } catch (updErr) {
      logger.error({ err: updErr?.message }, '[aiReply] failed to escalate conversation');
    }

    const customerName = conversation.customer?.name || conversation.customer?.phone || 'A customer';
    notify(tenantId, {
      type: 'escalation',
      title: `Human needed — AI couldn't handle ${customerName}`,
      body: `The AI failed to respond to a message from ${customerName}. The conversation has been escalated and needs your attention.`,
      emailSubject: `Action needed: AI escalation from ${customerName}`,
      emailHtml: escalationEmail({ customerName, reason: 'The AI ran into an error trying to reply and couldn\'t recover.' }),
      metadata: { conversationId },
    }).catch(() => {});

    return; // treat job as handled to avoid retry storms
  }

  // 3. Save AI's response to database
  const aiMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'ai',
      content: aiResponse.reply,
      meta: { aiForMessageId: messageId }
    }
  });

  // Push AI reply to connected dashboard tabs so it appears without a refresh
  pushEvent(tenantId, 'ai_message', {
    conversationId,
    message: { id: aiMessage.id, role: 'ai', content: aiResponse.reply, createdAt: aiMessage.createdAt },
  });

  // 4. Send response back to customer via WhatsApp
  await whatsappService.sendMessage(tenantId, conversation.customer.phone, aiResponse.reply);

  // If AI hit max steps it gave up — escalate and notify
  if (aiResponse.truncated) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'escalated' } }).catch(() => {});
    const customerName = conversation.customer?.name || conversation.customer?.phone || 'A customer';
    notify(tenantId, {
      type: 'escalation',
      title: `Human needed — AI couldn't resolve ${customerName}'s query`,
      body: `The AI reached its limit trying to help ${customerName}. The conversation has been escalated and needs your attention.`,
      emailSubject: `Action needed: AI escalation from ${customerName}`,
      emailHtml: escalationEmail({ customerName, reason: 'The AI made several attempts but couldn\'t resolve this on its own.' }),
      metadata: { conversationId },
    }).catch(() => {});
  }

  logger.info({ conversationId }, '[aiReply] AI response delivered');
}
