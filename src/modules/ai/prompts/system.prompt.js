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
    suggestOutsideCatalog: business.suggestOutsideCatalog,
  });

  // Current date/time in the business's timezone — the model's own sense of
  // "today" is stale (training cutoff), so this is the authoritative clock.
  // Per-business setting first, then platform default.
  const timeZone = business.timezone || process.env.BUSINESS_TIMEZONE || 'Africa/Lagos';
  let now;
  let weekdayShort;
  let hhmm;
  try {
    now = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
    weekdayShort = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(new Date());
    hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  } catch {
    now = new Date().toISOString();
  }

  const hoursLine = buildHoursLine(business, weekdayShort, hhmm);

  const lines = [
    persona,
    '',
    `Business: ${name}.`,
    business.aiPersona ? `Your name is ${business.aiPersona}.` : null,
    business.description ? `About: ${business.description}` : null,
    `Default currency: ${currency}.`,
    `Current date and time (${timeZone}): ${now}. Trust this over your own sense of the date — use it for anything time-related (deadlines, delivery estimates, receipt dates, greetings).`,
    hoursLine,
    'Always rely on tools (search_products, get_price, fetch_catalog, search_knowledge) for facts.',
  ].filter(Boolean);

  return lines.join('\n');
}

// Tells the model the business's actual operating schedule and whether it's
// open right now, so it can set honest expectations ("we'll get back to you
// when we open Monday at 8am") instead of chatting identically at 2am on a
// closed day as at noon on a business day. Silent (no line added) if the
// business never configured hours during onboarding — never invent a
// schedule.
function buildHoursLine(business, weekdayShort, hhmm) {
  const { availableDays, openingTime, closingTime } = business;
  if (!availableDays?.length || !openingTime || !closingTime) return null;

  const isOpenDay = availableDays.includes(weekdayShort);
  // Same-day hours only (e.g. 08:00-18:00) — a schedule that spans midnight
  // (e.g. opens 20:00, closes 02:00) isn't handled: closingTime would sort
  // before openingTime as a string and this would evaluate "never open".
  const isOpenTime = hhmm && hhmm >= openingTime && hhmm < closingTime;
  const isOpen = isOpenDay && isOpenTime;

  const schedule = `${availableDays.join(', ')} ${openingTime}–${closingTime}`;
  const status = isOpen
    ? 'The business is OPEN right now.'
    : `The business is CLOSED right now (outside operating hours). Still be helpful and can take the order/quote/question, but let the customer know a team member will follow up when the business reopens — do not imply someone is immediately available.`;

  return `Business hours: ${schedule}. ${status}`;
}

export default buildSystemPrompt;
