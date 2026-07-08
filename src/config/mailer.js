import { config } from './index.js';
import { logger } from './logger.js';

const RESEND_API = 'https://api.resend.com/emails';

export const sendMail = async ({ to, subject, html }) => {
  const apiKey = config.email.resendApiKey;
  if (!apiKey) {
    logger.warn('[mailer] RESEND_API_KEY not set — email not sent');
    return null;
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Resend API error ${res.status}`);
  }

  return res.json();
};

export default { sendMail };
