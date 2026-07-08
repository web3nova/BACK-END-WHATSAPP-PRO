import { buildPersonaPrompt } from './salesAgent.prompt.js';

/**
 * Build the system prompt for a chat turn.
 * @param {object} [business] - { displayName, description, currency, aiPersona, tone, language, collectMeasurements, generateQuotes }
 */
export function buildSystemPrompt(business = {}) {
  const name = business.displayName || 'this business';
  const currency = business.currency || 'NGN';
  const persona = buildPersonaPrompt({
    tone: business.tone,
    collectMeasurements: business.collectMeasurements,
    generateQuotes: business.generateQuotes,
  });

  const lines = [
    persona,
    '',
    `Business: ${name}.`,
    business.aiPersona ? `Your name is ${business.aiPersona}.` : null,
    business.description ? `About: ${business.description}` : null,
    `Default currency: ${currency}.`,
    'Always rely on tools (search_products, get_price, fetch_catalog, search_knowledge) for facts.',
  ].filter(Boolean);

  return lines.join('\n');
}

export default buildSystemPrompt;
