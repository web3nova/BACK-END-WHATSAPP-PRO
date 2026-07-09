import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { getChatProvider } from './providers/index.js';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './prompts/system.prompt.js';
import * as memory from './memory/conversationMemory.js';

const MAX_STEPS = 6; // safety cap on the tool-calling loop
const PROVIDER_TIMEOUT_MS = 20000; // 20s per LLM call — fail fast if provider hangs

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI provider timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function loadBusinessContext(tenantId) {
  const business = await withTimeout(
    prisma.business.findUnique({ where: { tenantId } }),
    8000
  ).catch(() => null);
  const ai = business?.settings?.ai || {};
  return {
    displayName: business?.displayName,
    description: business?.description,
    currency: business?.settings?.currency || 'NGN',
    aiPersona: ai.persona || '',
    tone: ai.tone || 'Friendly',
    collectMeasurements: ai.collectMeasurements !== false,
    generateQuotes: ai.generateQuotes !== false,
  };
}

/**
 * Run one customer turn through the agent loop.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.conversationId   - keys the short-term memory
 * @param {string} [params.customerId]     - used by order/quote tools
 * @param {string} params.message          - the customer's message
 * @returns {Promise<{ reply: string, steps: number, truncated?: boolean }>}
 */
export async function chat({ tenantId, conversationId, customerId, message }) {
  const provider = getChatProvider();
  const tools = getToolDefinitions();
  const system = buildSystemPrompt(await loadBusinessContext(tenantId));
  const ctx = { tenantId, conversationId, customerId };

  // Build history from the DB — the single source of truth. This includes
  // staff replies, order/quote confirmations, and anything sent while a human
  // had taken over, so the AI always has full conversation context.
  const dbMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const history = dbMessages.reverse().map((m) => {
    const content = m.content?.trim() || '[media attachment]';
    if (m.role === 'customer') return { role: 'user', content };
    if (m.role === 'staff') return { role: 'assistant', content: `[Sent by human staff] ${content}` };
    return { role: 'assistant', content }; // ai
  });

  // The incoming message is normally already saved to the DB before this runs;
  // only append it if it isn't the last customer turn (defensive).
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  if (!lastUser || lastUser.content !== message) {
    history.push({ role: 'user', content: message });
  }

  logger.info({ tenantId, conversationId, model: provider.name }, '[ai] calling provider');
  for (let step = 0; step < MAX_STEPS; step++) {
    const t0 = Date.now();
    const res = await withTimeout(provider.chat({ system, messages: history, tools }), PROVIDER_TIMEOUT_MS);
    logger.info({ tenantId, step, ms: Date.now() - t0 }, '[ai] provider responded');

    if (res.toolCalls?.length) {
      history.push({ role: 'assistant', content: res.text || '', toolCalls: res.toolCalls });
      for (const call of res.toolCalls) {
        const result = await executeTool(call.name, call.input, ctx);
        history.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      }
      continue; // let the model read tool results and respond
    }

    const reply = res.text?.trim() || 'I\'m not sure how to help with that. Could you rephrase your question?';
    return { reply, steps: step + 1 };
  }

  logger.warn({ tenantId, conversationId }, 'AI loop hit MAX_STEPS');
  const lastText = [...history].reverse().find((m) => m.role === 'assistant' && m.content)?.content;
  return {
    reply: lastText || 'Let me get a human to help you with that.',
    steps: MAX_STEPS,
    truncated: true,
  };
}

export async function resetMemory(conversationId) {
  await memory.clear(conversationId);
}

export default { chat, resetMemory };
