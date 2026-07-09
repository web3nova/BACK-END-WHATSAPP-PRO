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

  // Current date/time in the business's timezone — the model's own sense of
  // "today" is stale (training cutoff), so this is the authoritative clock.
  const timeZone = process.env.BUSINESS_TIMEZONE || 'Africa/Lagos';
  let now;
  try {
    now = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch {
    now = new Date().toISOString();
  }

  const lines = [
    persona,
    '',
    `Business: ${name}.`,
    business.aiPersona ? `Your name is ${business.aiPersona}.` : null,
    business.description ? `About: ${business.description}` : null,
    `Default currency: ${currency}.`,
    `Current date and time (${timeZone}): ${now}. Trust this over your own sense of the date — use it for anything time-related (deadlines, delivery estimates, receipt dates, greetings).`,
    'Always rely on tools (search_products, get_price, fetch_catalog, search_knowledge) for facts.',
  ].filter(Boolean);

  return lines.join('\n');
}

export default buildSystemPrompt;
