// SMS channel — wire up an SMS provider (e.g. Termii, Twilio) here.
// Stub: logs to console in development; replace with real provider call.
import { logger } from '../../../config/logger.js';

export async function sendSMS({ to, text }) {
  logger.warn({ to, text }, '[SMS] SMS provider not configured — message not sent');
}

export default { sendSMS };
