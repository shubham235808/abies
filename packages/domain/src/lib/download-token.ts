import { createHmac, timingSafeEqual } from 'crypto';
import { getEnv } from './env';
import { UnauthorizedError } from './errors';

// Short-lived, HMAC-signed token binding a storage key to an expiry —
// lets a route serve a file to a client with no session cookie attached
// (url_launcher opening the system browser, a bare Dio/fetch instance
// deliberately bypassing the authenticated API client — the mobile apps'
// established pattern for "view"/"download" actions) without the file
// actually needing to be a permanent public link. The token itself is the
// proof of authorization, scoped to exactly one key, for a short time —
// the same role getSignedDownloadUrl()'s signature used to play, now
// issued by this app instead of a host (STORAGE_ENDPOINT) no browser
// outside the cluster can reach.
//
// The caller must still do its own access check (ownership, role, document
// status) BEFORE calling createDownloadToken — this only proves "whoever
// has this token was handed it by someone who already passed that check
// moments ago," not that the bearer is any particular user.

function sign(key: string, expiresAt: number): string {
  return createHmac('sha256', getEnv().DOWNLOAD_TOKEN_SECRET).update(`${key}:${expiresAt}`).digest('base64url');
}

export function createDownloadToken(storageKey: string, expiresInSeconds = 300): string {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const sig = sign(storageKey, expiresAt);
  return Buffer.from(JSON.stringify({ k: storageKey, e: expiresAt, s: sig })).toString('base64url');
}

export function verifyDownloadToken(token: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedError('Invalid or expired download link');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).k !== 'string' ||
    typeof (parsed as Record<string, unknown>).e !== 'number' ||
    typeof (parsed as Record<string, unknown>).s !== 'string'
  ) {
    throw new UnauthorizedError('Invalid or expired download link');
  }
  const { k: storageKey, e: expiresAt, s: sig } = parsed as { k: string; e: number; s: string };
  if (Date.now() > expiresAt) throw new UnauthorizedError('Invalid or expired download link');

  const expected = Buffer.from(sign(storageKey, expiresAt));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new UnauthorizedError('Invalid or expired download link');
  }
  return storageKey;
}
