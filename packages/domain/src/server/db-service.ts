import { readFileSync } from 'fs';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import { cookies } from 'next/headers';
import { getSessionByToken, SESSION_COOKIE_NAME, type SessionInfo } from './session';

// Shared by the database service (its own Deployment, same image) and the apps
// that call it. See docs/DB-SERVICE-PLAN.md.
//
// Callers prove who they are with their Kubernetes ServiceAccount token. The
// database service checks it with a TokenReview, then checks the username
// against the allow-list. The end user's session token travels in its own
// header and is looked up in the database, so the role is never taken from
// the caller.

export const SERVICE_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
export const SESSION_HEADER = 'x-abies-session';
const K8S_API = 'https://kubernetes.default.svc';

// Usernames look like system:serviceaccount:<namespace>:<name>.
function allowedCallers(): Set<string> {
  const raw = process.env.DB_SERVICE_ALLOWED_CALLERS ?? '';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

// The database service verifies the calling pod's token with the Kubernetes API.
export async function verifyCallerToken(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new UnauthorizedError('Missing service token');

  const reviewerToken = readFileSync(SERVICE_TOKEN_PATH, 'utf8').trim();
  const res = await fetch(`${K8S_API}/apis/authentication.k8s.io/v1/tokenreviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reviewerToken}` },
    body: JSON.stringify({ apiVersion: 'authentication.k8s.io/v1', kind: 'TokenReview', spec: { token } }),
  });
  if (!res.ok) throw new UnauthorizedError('Service token could not be verified');
  const review = (await res.json()) as { status?: { authenticated?: boolean; user?: { username?: string } } };
  if (!review.status?.authenticated) throw new UnauthorizedError('Service token is not valid');

  const username = review.status.user?.username ?? '';
  if (!allowedCallers().has(username)) throw new ForbiddenError('This service may not call the database service');
  return username;
}

// The end user's session, checked in the database. Returns null if missing or revoked.
export async function sessionFromRequest(req: Request): Promise<SessionInfo> {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!token) throw new UnauthorizedError();
  const session = await getSessionByToken(token);
  if (!session) throw new UnauthorizedError('Session expired or revoked');
  return session;
}

// Used by the calling apps. Adds the service token and the end user's session.
export async function callDbService<T>(
  path: string,
  init: { method?: string; body?: unknown; sessionToken: string; requestId?: string },
): Promise<{ status: number; body: T }> {
  const base = process.env.DB_SERVICE_URL;
  if (!base) throw new Error('DB_SERVICE_URL is not set');
  const serviceToken = readFileSync(SERVICE_TOKEN_PATH, 'utf8').trim();
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken}`,
      [SESSION_HEADER]: init.sessionToken,
      ...(init.requestId ? { 'x-request-id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

// The browser's session token, for the apps' proxy routes and server pages.
export async function sessionTokenFromCookies(): Promise<string> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? '';
}
