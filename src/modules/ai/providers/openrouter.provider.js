import OpenAI from 'openai';

const CALL_TIMEOUT_MS = 20_000;

let client;
const getClient = () =>
  (client ??= new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    timeout: CALL_TIMEOUT_MS,
    defaultHeaders: {
      'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.biziq.online',
      'X-OpenRouter-Title': 'BizIQ',
    },
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

export const openrouterProvider = {
  name: 'openrouter',

  async chat({ system, messages, tools, maxTokens = 1024 }) {
    const model = process.env.OPENROUTER_CHAT_MODEL || 'openrouter/free';

    const res = await getClient().chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: toMessages(system, messages),
      ...(tools?.length && {
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: 'auto',
      }),
      provider: {
        sort: 'throughput',
        require_parameters: true, // only route to providers that support tools
      },
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

export default openrouterProvider;
