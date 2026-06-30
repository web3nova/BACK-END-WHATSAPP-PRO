import nodemailer from 'nodemailer';
import { config } from './index.js';

export const transporter = nodemailer.createTransport({
  host:             config.email.host,
  port:             config.email.port,
  secure:           config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
  connectionTimeout: 10_000, // fail after 10s if SMTP unreachable
  greetingTimeout:   5_000,  // fail after 5s if SMTP doesn't respond
  socketTimeout:     10_000, // fail after 10s of socket inactivity
});

export const sendMail = async ({ to, subject, html }) => {
  return transporter.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
  });
};

export default { transporter, sendMail };