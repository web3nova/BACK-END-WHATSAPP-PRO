import { claudeProvider } from './claude.provider.js';
import { openaiProvider } from './openai.provider.js';
import { geminiProvider } from './gemini.provider.js';
import { deepseekProvider } from './deepseek.provider.js';
import { openrouterProvider } from './openrouter.provider.js';
import { jinaProvider } from './jina.provider.js';
import { config } from '../../../config/index.js';

/**
 * Provider abstraction for the Intelligence Layer.
 *
 * Chat providers implement:
 *   chat({ system, messages, tools, maxTokens })
 *     -> { text: string|null, toolCalls: [{ id, name, input }], stopReason }
 *
 * Embedding providers implement:
 *   embed(texts: string[]) -> Promise<number[][]>
 */

const chatProviders = {
  anthropic: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  deepseek: deepseekProvider,
  openrouter: openrouterProvider,
};

const embeddingProviders = {
  openai: openaiProvider, // needs OPENAI_API_KEY
  jina: jinaProvider,     // needs JINA_API_KEY — 8M tokens/month free
};

export function getChatProvider() {
  const key = process.env.AI_CHAT_PROVIDER ?? config.ai.chatProvider;
  // Explicit provider set — use it
  if (key && key !== 'auto' && chatProviders[key]) return chatProviders[key];
  // Auto-detect: first key that is configured wins
  if (process.env.OPENROUTER_API_KEY) return openrouterProvider;
  if (process.env.ANTHROPIC_API_KEY)   return claudeProvider;
  if (process.env.OPENAI_API_KEY)      return openaiProvider;
  if (process.env.DEEPSEEK_API_KEY)    return deepseekProvider;
  throw new Error('No AI provider configured. Set OPENROUTER_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY).');
}

export function getEmbeddingProvider() {
  const key = process.env.AI_EMBEDDING_PROVIDER ?? config.ai.embeddingProvider ?? 'openai';
  const provider = embeddingProviders[key];
  if (!provider) throw new Error(`Unknown AI_EMBEDDING_PROVIDER: "${key}". Valid: ${Object.keys(embeddingProviders).join(', ')}`);
  return provider;
}

export { claudeProvider, openaiProvider, geminiProvider, deepseekProvider, openrouterProvider, jinaProvider };

