import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'enc:v1:';

function getKey(envVarName) {
  const raw = process.env[envVarName];
  if (!raw) throw new Error(`${envVarName} is not set`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to 32 bytes (generate with crypto.randomBytes(32).toString("base64"))`);
  }
  return key;
}

function encryptWith(envVarName, plaintext) {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(envVarName), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptWith(envVarName, value) {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(envVarName), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// Payment provider keys (PaymentConfig) and WhatsApp access tokens
// (WhatsappAccount) — a smaller blast radius if this key is ever rotated
// than the conversation-message key below.
export function encryptSecret(plaintext) {
  return encryptWith('PAYMENT_ENCRYPTION_KEY', plaintext);
}
export function decryptSecret(value) {
  return decryptWith('PAYMENT_ENCRYPTION_KEY', value);
}

// Conversation message content (Message.content) — deliberately a separate
// key from PAYMENT_ENCRYPTION_KEY. These protect very different things (a
// customer's chat history vs. a business's provider credentials); a leak or
// rotation of one shouldn't force re-authenticating/rotating the other.
export function encryptMessage(plaintext) {
  return encryptWith('MESSAGE_ENCRYPTION_KEY', plaintext);
}
export function decryptMessage(value) {
  return decryptWith('MESSAGE_ENCRYPTION_KEY', value);
}

// Masks a secret for display in API responses — never send raw secrets to the browser.
export function maskSecret(plaintext) {
  if (!plaintext) return '';
  const visible = plaintext.slice(-4);
  return `${'•'.repeat(Math.max(plaintext.length - 4, 4))}${visible}`;
}

export const SECRET_PLACEHOLDER = '__UNCHANGED__';
