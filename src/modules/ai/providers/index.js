import { claudeProvider } from './claude.provider.js';
import { openaiProvider } from './openai.provider.js';
import { geminiProvider } from './gemini.provider.js';
import { deepseekProvider } from './deepseek.provider.js';
import { config } from '../../../config/index.js';

/**
 * Provider abstraction for the Intelligence Layer.
 *
 * Normalized message history (provider-agnostic):
 *   { role: 'user'|'assistant', content: string }
 *   { role: 'assistant', content?: string, toolCalls: [{ id, name, input }] }
 *   { role: 'tool', toolCallId, name, content }
 *
 * A chat provider implements:
 *   chat({ system, messages, tools, maxTokens })
 *     -> { text: string|null, toolCalls: [{ id, name, input }], stopReason }
 *
 * Tool definitions passed to chat():
 *   { name, description, parameters: <JSON schema object> }
 */

const chatProviders = {
  anthropic: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  deepseek: deepseekProvider,
};

export function getChatProvider() {
  return chatProviders[process.env.AI_CHAT_PROVIDER] ?? chatProviders[config.ai.chatProvider] ?? claudeProvider;
}

// Only OpenAI implements embeddings here; Claude has no embedding endpoint.
export function getEmbeddingProvider() {
  return openaiProvider;
}

export { claudeProvider, openaiProvider, geminiProvider, deepseekProvider };

