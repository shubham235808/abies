import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, getSessionByToken, type SessionInfo } from './session';

// Read-only session lookup for Server Components and layouts. Unlike
// requireSession() (used by route handlers/server actions), this never
// rotates the token — Server Components can't set response cookies, so
// there's nothing to apply a rotation to. Route handlers remain the only
// place sliding expiry actually happens.
export async function getCurrentSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSessionByToken(token);
}

// For portal pages: PortalShell (the layout) already redirects unauthenticated
// requests to /login, but it and the page each make their own independent
// getCurrentSession() call — there's no shared guarantee the session is
// still non-null a moment later (revoked between the two calls, expired,
// etc.). Pages must not assume the layout's check covers them; this
// re-checks and redirects the same way instead of letting `session!.foo`
// crash with a null-dereference if that assumption ever breaks.
export async function requireSessionOrRedirect(): Promise<SessionInfo> {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  return session;
}
