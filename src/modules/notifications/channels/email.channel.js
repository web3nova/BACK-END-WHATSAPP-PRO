import { sendMail } from '../../../config/mailer.js';

export async function sendEmail({ to, subject, html }) {
  return sendMail({ to, subject, html });
}

export default { sendEmail };
