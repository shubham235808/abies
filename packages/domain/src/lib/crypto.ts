import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getEnv } from './env';

// AES-256-GCM, reversible — unlike OTP_PEPPER's HMAC use (one-way hash, never
// decrypted), MFA_TOTP_SECRET must be decryptable to verify a code. The env
// value is hashed to 32 bytes rather than required to already be one, so
// whoever sets it can use any sufficiently long random string, same as
// OTP_PEPPER.
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function keyFromEnv(): Buffer {
  const env = getEnv();
  if (!env.MFA_ENCRYPTION_KEY) throw new Error('MFA_ENCRYPTION_KEY is not configured');
  return createHash('sha256').update(env.MFA_ENCRYPTION_KEY).digest();
}

// `iv.authTag.ciphertext`, each base64 — a fresh random IV every call, never
// reused with the same key (GCM requirement).
export function encryptSecret(plaintext: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(encoded: string): string {
  const key = keyFromEnv();
  const parts = encoded.split('.');
  const [ivB64, tagB64, dataB64] = parts;
  if (parts.length !== 3 || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
