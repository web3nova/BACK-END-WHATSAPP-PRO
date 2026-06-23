import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/index.js';

let client;
const getClient = () => (client ??= new Anthropic({ apiKey: config.ai.anthropic.apiKey }));

const asString = (content) =>
  typeof content === 'string' ? content : JSON.stringify(content ?? '');

// Normalized history -> Anthropic message format.
// Normalized message shapes (see providers/index.js):
//   { role: 'user'|'assistant', content: string }
//   { role: 'assistant', content?: string, toolCalls: [{ id, name, input }] }
//   { role: 'tool', toolCallId, name, content }
function toAnthropicMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: asString(m.content) }],
      };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: 'assistant', content };
    }
    return { role: m.role, content: m.content };
  });
}

export const claudeProvider = {
  name: 'anthropic',

  async chat({ system, messages, tools, maxTokens = 1024 }) {
    const res = await getClient().messages.create({
      model: config.ai.anthropic.chatModel,
      max_tokens: maxTokens,
      system,
      messages: toAnthropicMessages(messages),
      tools: tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    });

    let text = '';
    const toolCalls = [];
    for (const block of res.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    return { text: text || null, toolCalls, stopReason: res.stop_reason };
  },
};

export default claudeProvider;
