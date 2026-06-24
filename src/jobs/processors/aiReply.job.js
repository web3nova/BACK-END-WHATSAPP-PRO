import { prisma } from '../../config/prisma.js';
import aiService from '../../modules/ai/ai.service.js';
import * as whatsappService from '../../modules/whatsapp/whatsapp.service.js';

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
    console.log(`[aiReply] Conversation ${conversationId} is ${conversation.status}. AI skipped.`);
    return;
  }

  // Idempotency: if an AI reply for this message already exists, skip
  if (messageId) {
    const existingAi = await prisma.message.findFirst({
      where: { conversationId, role: 'ai', meta: { path: ['aiForMessageId'], equals: messageId } }
    });
    if (existingAi) {
      console.log(`[aiReply] AI reply already exists for message ${messageId}, skipping.`);
      return;
    }
  }

  // 2. Call the AI Service
  console.log(`[aiReply] Triggering AI for conversation ${conversationId}`);
  let aiResponse;
  try {
    aiResponse = await aiService.chat({
      tenantId,
      conversationId,
      customerId: conversation.customerId,
      message: message.content
    });
  } catch (err) {
    console.error(`[aiReply] AI service failed for conversation ${conversationId}:`, err?.message || err);

    // Save a fallback AI message and attempt to notify the user, then escalate the conversation
    const fallback = 'Sorry, I could not process your message right now. A human will reply shortly.';
    await prisma.message.create({ data: { conversationId, role: 'ai', content: fallback, meta: { aiForMessageId: messageId } } });

    try {
      await whatsappService.sendMessage(tenantId, conversation.customer.phone, fallback);
    } catch (sendErr) {
      console.error('[aiReply] Failed to send fallback message via WhatsApp:', sendErr?.message || sendErr);
    }

    try {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'escalated' } });
    } catch (updErr) {
      console.error('[aiReply] Failed to escalate conversation:', updErr?.message || updErr);
    }

    return; // treat job as handled to avoid retry storms
  }

  // 3. Save AI's response to database
  await prisma.message.create({
    data: {
      conversationId,
      role: 'ai',
      content: aiResponse.reply,
      meta: { aiForMessageId: messageId }
    }
  });

  // 4. Send response back to customer via WhatsApp
  await whatsappService.sendMessage(tenantId, conversation.customer.phone, aiResponse.reply);

  console.log(`[aiReply] AI response sent to ${conversation.customer.phone}`);
}
