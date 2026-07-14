import { GoogleGenAI } from '@google/genai';
import { config } from '../../../config/index.js';
import { logger } from '../../../config/logger.js';

// Accepts GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY. If missing, chat() throws.
const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
let ai;
if (geminiKey) {
  ai = new GoogleGenAI({ apiKey: geminiKey });
}

// Gemini's fileData.fileUri only works for URIs from its own Files API — for
// arbitrary external URLs (our R2 signed URLs) we have to fetch the bytes
// ourselves and send them as inlineData base64.
async function urlToInlineImagePart(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { inlineData: { mimeType, data: buffer.toString('base64') } };
  } catch (err) {
    logger.warn({ err: err?.message, url }, '[gemini] failed to fetch image for vision input');
    return null;
  }
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
    const geminiContents = (await Promise.all(messages.map(async msg => {
      let parts = [];
      if (msg.role === 'user') {
        parts.push({ text: msg.content });
        // Vision: user turns may carry image URLs (receipts, product photos)
        if (msg.images?.length) {
          const imageParts = (await Promise.all(msg.images.map(urlToInlineImagePart))).filter(Boolean);
          parts.push(...imageParts);
        }
        return { role: 'user', parts };
      } else if (msg.role === 'assistant') {
        if (msg.content) parts.push({ text: msg.content });
        if (msg.toolCalls) {
          msg.toolCalls.forEach(tc => {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.input
              },
              // Gemini 3.x "thinking" models require this echoed back verbatim
              // on replayed functionCall parts, or the next call 400s with
              // "Function call is missing a thought_signature".
              ...(tc.thoughtSignature && { thoughtSignature: tc.thoughtSignature }),
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
        // Gemini's functionResponse.response is a Struct (object), not a
        // repeated field — a tool that returns a bare array (e.g.
        // search_products) must be wrapped, or the API 400s with "Proto
        // field is not repeating, cannot start list".
        if (Array.isArray(responsePayload)) {
          responsePayload = { results: responsePayload };
        }
        parts.push({
          functionResponse: {
            name: msg.name,
            response: responsePayload
          }
        });
        return { role: 'user', parts }; // function responses go as 'user' role in Gemini
      }
    }))).filter(Boolean);

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
      // candidate.content is absent when Gemini blocks/truncates the response
      // (e.g. finishReason SAFETY, PROHIBITED_CONTENT, RECITATION) — degrade to
      // an empty reply instead of throwing, so the caller's fallback text kicks
      // in rather than the whole turn crashing and escalating to a human.
      if (!candidate?.content?.parts) {
        logger.warn({ finishReason: candidate?.finishReason }, 'Gemini returned no content');
        return { text: '', toolCalls: [], stopReason: candidate?.finishReason || 'empty' };
      }

      let text = '';
      let toolCalls = [];

      for (const p of candidate.content.parts) {
        if (p.text) text += p.text;
        if (p.functionCall) {
          toolCalls.push({
            id: p.functionCall.name + '_' + Date.now(), // Generate a fake ID since Gemini doesn't use call IDs
            name: p.functionCall.name,
            input: p.functionCall.args,
            // Must be echoed back on replay — see note in the history-building code above.
            ...(p.thoughtSignature && { thoughtSignature: p.thoughtSignature }),
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
