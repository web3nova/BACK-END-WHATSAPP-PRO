import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { getChatProvider } from './providers/index.js';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { buildSystemPrompt } from './prompts/system.prompt.js';
import * as memory from './memory/conversationMemory.js';

const MAX_STEPS = 6; // safety cap on the tool-calling loop

async function loadBusinessContext(tenantId) {
  const business = await prisma.business.findUnique({ where: { tenantId } });
  return {
    displayName: business?.displayName,
    description: business?.description,
    currency: business?.settings?.currency || 'NGN',
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

  const history = await memory.load(conversationId);
  history.push({ role: 'user', content: message });

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await provider.chat({ system, messages: history, tools });

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

    const reply = res.text ?? '';
    history.push({ role: 'assistant', content: reply });
    await memory.save(conversationId, history);
    return { reply, steps: step + 1 };
  }

  logger.warn({ tenantId, conversationId }, 'AI loop hit MAX_STEPS');
  await memory.save(conversationId, history);
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
