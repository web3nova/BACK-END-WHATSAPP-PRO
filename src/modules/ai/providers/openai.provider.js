import OpenAI from 'openai';
import { config } from '../../../config/index.js';

let client;
const getClient = () => (client ??= new OpenAI({ apiKey: config.ai.openai.apiKey }));

const asString = (content) =>
  typeof content === 'string' ? content : JSON.stringify(content ?? '');

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

// Normalized history -> OpenAI chat format.
function toOpenAIMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: asString(m.content) });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export const openaiProvider = {
  name: 'openai',

  async chat({ system, messages, tools, maxTokens = 1024 }) {
    const res = await getClient().chat.completions.create({
      model: config.ai.openai.chatModel,
      max_tokens: maxTokens,
      messages: toOpenAIMessages(system, messages),
      tools: tools?.length
        ? tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        : undefined,
      tool_choice: tools?.length ? 'auto' : undefined,
    });

    const msg = res.choices[0].message;
    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParse(tc.function.arguments),
    }));

    return { text: msg.content ?? null, toolCalls, stopReason: res.choices[0].finish_reason };
  },

  // Embeddings — provider for the RAG pipeline.
  async embed(texts) {
    const input = Array.isArray(texts) ? texts : [texts];
    const res = await getClient().embeddings.create({
      model: config.ai.openai.embeddingModel,
      input,
    });
    return res.data.map((d) => d.embedding);
  },
};

export default openaiProvider;
