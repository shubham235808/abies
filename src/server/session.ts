import { createHash, randomBytes } from 'crypto';
import type { User, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getEnv } from '@/lib/env';

// HTTP-only cookie session (docs/SECURITY-MODEL.md "Authentication:
// Session"). The cookie carries only an opaque random token — the server
// looks up a Session row by its hash on every request and never trusts a
// client-supplied user id/role/mfa flag.
export const SESSION_COOKIE_NAME = 'abies_session';

export interface SessionUser {
  id: string;
  mobile: string;
  email: string | null;
  role: UserRole;
}

export interface SessionInfo {
  id: string;
  userId: string;
  mfaVerified: boolean;
  expiresAt: Date;
  user: SessionUser;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(48).toString('base64url');
}

function cacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

const CACHE_TTL_SECONDS = 60;

async function cacheSession(tokenHash: string, info: SessionInfo): Promise<void> {
  await redis.set(cacheKey(tokenHash), JSON.stringify(info), 'EX', CACHE_TTL_SECONDS).catch(() => undefined);
}

async function invalidateCache(tokenHash: string): Promise<void> {
  await redis.del(cacheKey(tokenHash)).catch(() => undefined);
}

export interface CreateSessionInput {
  userId: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<{ token: string; session: SessionInfo }> {
  const env = getEnv();
  const token = newToken();
  const needsMfa = input.role === 'ADMIN' && env.ADMIN_MFA_REQUIRED;
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);

  const row = await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(token),
      mfaVerified: !needsMfa,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    },
    include: { user: true },
  });

  const session = toSessionInfo(row);
  return { token, session };
}

function toSessionInfo(row: {
  id: string;
  userId: string;
  mfaVerified: boolean;
  expiresAt: Date;
  user: User;
}): SessionInfo {
  return {
    id: row.id,
    userId: row.userId,
    mfaVerified: row.mfaVerified,
    expiresAt: row.expiresAt,
    user: {
      id: row.user.id,
      mobile: row.user.mobile,
      email: row.user.email,
      role: row.user.role,
    },
  };
}

// Looks up a session by its raw cookie token. Returns null for a
// missing/expired/revoked session, or a user whose account is no longer
// ACTIVE (matches Sprint 3's refresh-time status check, ported per D3).
export async function getSessionByToken(token: string): Promise<SessionInfo | null> {
  const tokenHash = hashToken(token);

  const cached = await redis.get(cacheKey(tokenHash)).catch(() => null);
  if (cached) {
    const parsed = JSON.parse(cached) as SessionInfo & { expiresAt: string };
    if (new Date(parsed.expiresAt) > new Date()) {
      return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
    }
    await invalidateCache(tokenHash);
  }

  const row = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt <= new Date() || row.user.status !== 'ACTIVE') {
    return null;
  }

  const session = toSessionInfo(row);
  await cacheSession(tokenHash, session);
  return session;
}

// Sliding expiry: once a session is past the halfway point of its life,
// issue a fresh token and extend expiry, invalidating the old token
// immediately (docs/SECURITY-MODEL.md). Only meaningful from a context that
// can set a response cookie (Route Handlers / Server Actions) — Server
// Components are read-only, so they never rotate.
export async function rotateSessionIfDue(
  session: SessionInfo,
  currentToken: string,
): Promise<string | null> {
  const env = getEnv();
  const totalMs = env.SESSION_TTL_DAYS * 86_400_000;
  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs > totalMs / 2) return null;

  const newTok = newToken();
  const newExpiresAt = new Date(Date.now() + totalMs);
  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashToken(newTok), expiresAt: newExpiresAt },
  });
  await invalidateCache(hashToken(currentToken));
  session.expiresAt = newExpiresAt;
  return newTok;
}

export async function markMfaVerified(sessionId: string): Promise<void> {
  const row = await prisma.session.update({
    where: { id: sessionId },
    data: { mfaVerified: true },
  });
  await invalidateCache(row.tokenHash);
}

export async function revokeSession(sessionId: string): Promise<void> {
  const row = await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await invalidateCache(row.tokenHash);
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const rows = await prisma.session.findMany({ where: { userId, revokedAt: null } });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await Promise.all(rows.map((r) => invalidateCache(r.tokenHash)));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // Derived from how the app is actually being served, not NODE_ENV: a
    // Secure cookie is silently dropped by the browser over plain HTTP,
    // which is exactly how this repo's LAN-exposed review deployment
    // (docker-compose.yml) serves traffic today. The real deployment
    // (Phase 12, behind Nginx/TLS) sets APP_BASE_URL to an https:// origin,
    // which is what should actually gate this — not the Next.js build mode.
    secure: getEnv().APP_BASE_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
