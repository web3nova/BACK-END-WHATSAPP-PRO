import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!raw) throw new Error('PAYMENT_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYMENT_ENCRYPTION_KEY must decode to 32 bytes (generate with crypto.randomBytes(32).toString("base64"))');
  }
  return key;
}

// Encrypts a plaintext string. Returns null/'' unchanged so optional fields stay optional.
export function encryptSecret(plaintext) {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

// Decrypts a value produced by encryptSecret. Values without the enc:v1: prefix
// are treated as legacy plaintext and returned as-is, so existing unencrypted
// rows keep working until they're next saved (and transparently re-encrypted).
export function decryptSecret(value) {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// Masks a secret for display in API responses — never send raw secrets to the browser.
export function maskSecret(plaintext) {
  if (!plaintext) return '';
  const visible = plaintext.slice(-4);
  return `${'•'.repeat(Math.max(plaintext.length - 4, 4))}${visible}`;
}

export const SECRET_PLACEHOLDER = '__UNCHANGED__';
