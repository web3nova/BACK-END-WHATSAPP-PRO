import { SALES_AGENT_PERSONA } from './salesAgent.prompt.js';

/**
 * Build the system prompt for a chat turn.
 * @param {object} [business] - { displayName, description, currency, settings }
 */
export function buildSystemPrompt(business = {}) {
  const name = business.displayName || 'this business';
  const currency = business.currency || 'NGN';

  const lines = [
    SALES_AGENT_PERSONA,
    '',
    `Business: ${name}.`,
    business.description ? `About: ${business.description}` : null,
    `Default currency: ${currency}.`,
    'Always rely on tools (search_products, get_price, fetch_catalog, search_knowledge) for facts.',
  ].filter(Boolean);

  return lines.join('\n');
}

export default buildSystemPrompt;
