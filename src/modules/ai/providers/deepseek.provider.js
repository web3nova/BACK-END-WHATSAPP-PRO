import OpenAI from 'openai';

let client;
const getClient = () =>
  (client ??= new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  }));

const asString = (content) =>
  typeof content === 'string' ? content : JSON.stringify(content ?? '');

const safeParse = (s) => {
  try { return JSON.parse(s); } catch { return {}; }
};

function toMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    // DeepSeek's chat API (deepseek-chat / deepseek-reasoner) has no vision
    // input — sending image_url content blocks 400s. Fall back to the plain
    // text placeholder ai.service.js already builds ("[customer attached an
    // image]") rather than guessing at an unsupported format.
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

export const deepseekProvider = {
  name: 'deepseek',

  async chat({ system, messages, tools, maxTokens = 1024 }) {
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const res = await getClient().chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: toMessages(system, messages),
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
};

export default deepseekProvider;
