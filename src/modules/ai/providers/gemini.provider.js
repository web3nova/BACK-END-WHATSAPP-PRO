import { GoogleGenAI } from '@google/genai';
import { config } from '../../../config/index.js';
import { logger } from '../../../config/logger.js';

// Accepts GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY. If missing, chat() throws.
const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
let ai;
if (geminiKey) {
  ai = new GoogleGenAI({ apiKey: geminiKey });
}

export const geminiProvider = {
  async chat({ system, messages, tools = [], maxTokens = 1024 }) {
    if (!ai) {
      throw new Error('Gemini API key is not configured (set GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY)');
    }

    // Default to flash: 2.5-pro has NO free-tier quota and 429s immediately
    const modelName = process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash';

    // Map system to instructions
    const systemInstruction = system;

    // Convert unified messages to Gemini format
    // Unified: 'user', 'assistant' (with optional toolCalls), 'tool' (with toolCallId, name, content)
    // Gemini: 'user', 'model' (with parts: text, functionCall, functionResponse)
    const geminiContents = messages.map(msg => {
      let parts = [];
      if (msg.role === 'user') {
        parts.push({ text: msg.content });
        return { role: 'user', parts };
      } else if (msg.role === 'assistant') {
        if (msg.content) parts.push({ text: msg.content });
        if (msg.toolCalls) {
          msg.toolCalls.forEach(tc => {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.input
              }
            });
          });
        }
        return { role: 'model', parts };
      } else if (msg.role === 'tool') {
        let responsePayload;
        try {
          responsePayload = JSON.parse(msg.content);
        } catch {
          responsePayload = { result: msg.content };
        }
        parts.push({
          functionResponse: {
            name: msg.name,
            response: responsePayload
          }
        });
        return { role: 'user', parts }; // function responses go as 'user' role in Gemini
      }
    }).filter(Boolean);

    // Map tools to Gemini function declarations
    let geminiTools;
    if (tools.length > 0) {
      geminiTools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }];
    }

    try {
      if (!ai || !ai.models || typeof ai.models.generateContent !== 'function') {
        throw new Error('Gemini client is not properly initialized (models.generateContent not available)');
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: geminiContents,
        config: {
          systemInstruction,
          tools: geminiTools,
          maxOutputTokens: maxTokens,
          temperature: 0.2
        }
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        return { text: '', stopReason: 'empty' };
      }

      const part = candidate.content.parts[0];

      let text = '';
      let toolCalls = [];

      for (const p of candidate.content.parts) {
        if (p.text) text += p.text;
        if (p.functionCall) {
          toolCalls.push({
            id: p.functionCall.name + '_' + Date.now(), // Generate a fake ID since Gemini doesn't use call IDs
            name: p.functionCall.name,
            input: p.functionCall.args
          });
        }
      }

      return {
        text: text || null,
        toolCalls,
        stopReason: candidate.finishReason
      };
    } catch (err) {
      logger.error({ err }, 'Gemini API call failed');
      // Rethrow a clearer error for callers to handle
      throw new Error(`Gemini API error: ${err?.message || err}`);
    }
  }
};
