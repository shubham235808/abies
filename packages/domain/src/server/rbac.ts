import type { UserRole } from '@prisma/client';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { hasPermission, type Permission } from './permissions';
import {
  SESSION_COOKIE_NAME,
  getSessionByToken,
  rotateSessionIfDue,
  sessionCookieOptions,
  type SessionInfo,
} from './session';

export interface RequestContext {
  session: SessionInfo;
  ip?: string;
  userAgent?: string;
  /** Set when the session was rotated — caller must apply this to the response. */
  rotatedToken?: string;
}

function clientMeta(req: Request): { ip?: string; userAgent?: string } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;
  return { ip, userAgent };
}

// Reads the session cookie, validates it, and rotates it if it's due
// (docs/SECURITY-MODEL.md sliding expiry). Every authenticated route
// handler starts with this — never trust anything from the request body
// for identity.
export async function requireSession(req: Request): Promise<RequestContext> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();

  const session = await getSessionByToken(token);
  if (!session) throw new UnauthorizedError('Session expired or revoked');

  const rotatedToken = await rotateSessionIfDue(session, token);
  return { session, rotatedToken: rotatedToken ?? undefined, ...clientMeta(req) };
}

// Optional variant for endpoints that behave differently when signed in vs.
// anonymous (e.g. consent listing) but don't require it.
export async function optionalSession(req: Request): Promise<RequestContext | null> {
  try {
    return await requireSession(req);
  } catch {
    return null;
  }
}

export function requireRole(ctx: RequestContext, ...roles: UserRole[]): void {
  if (!roles.includes(ctx.session.user.role)) {
    throw new ForbiddenError('Role is not allowed for this operation');
  }
}

// Permission-string layer on top of the role check above
// (docs/ENTERPRISE-DATA-MODEL-CHANGES.md §9) — call sites use this instead
// of requireRole when the operation maps to a specific named capability
// (e.g. 'pharmacy.product.create') rather than "any user with this role."
// Still role-derived today (src/server/permissions.ts), so this doesn't
// replace requireRole elsewhere — it's an additive, more precise gate for
// the call sites that opt into it.
export function requirePermission(ctx: RequestContext, permission: Permission): void {
  if (!hasPermission(ctx.session.user.role, permission)) {
    throw new ForbiddenError('This account does not have the required permission for this operation');
  }
}

// Gate for privileged admin actions (docs/SECURITY-MODEL.md: doctor
// approval/suspension, refunds, role changes, audit access, ...). Implies
// requireRole(ctx, 'ADMIN', 'SUPER_ADMIN') — SUPER_ADMIN is ADMIN-equivalent
// by decision — and an MFA-verified session is meaningless for a non-admin.
export function requireAdminMfa(ctx: RequestContext): void {
  requireRole(ctx, 'ADMIN', 'SUPER_ADMIN');
  if (!ctx.session.mfaVerified) {
    throw new ForbiddenError('MFA verification required');
  }
}

// Gate for sub-admin roles scoped to a single permission (e.g. FINANCE on
// settlement.manage) that still need MFA for the same reason ADMIN does —
// requireAdminMfa can't be reused here since it hardcodes the admin roles.
export function requireMfaPermission(ctx: RequestContext, permission: Permission): void {
  requirePermission(ctx, permission);
  if (!ctx.session.mfaVerified) {
    throw new ForbiddenError('MFA verification required');
  }
}

// Applies a rotated session token to the outgoing response, if rotation
// happened during requireSession(). Route handlers that authenticate should
// always pipe their response through this before returning.
export function applyRotatedCookie<T extends NextResponse>(response: T, ctx: RequestContext): T {
  if (!ctx.rotatedToken) return response;
  response.cookies.set(SESSION_COOKIE_NAME, ctx.rotatedToken, sessionCookieOptions(ctx.session.expiresAt));
  return response;
}
