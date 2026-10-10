import { getEnv } from '../lib/env';
import { ForbiddenError } from '../lib/errors';

// Was duplicated inline across ~19 route handlers (every CRM write route
// plus /contact), each independently comparing the request's Origin header
// against a single APP_BASE_URL-derived value. Centralized here, both so
// it can't drift between call sites and so it can accept more than one
// legitimate origin — same backend, more than one real hostname (UAT
// answers on its public abies.in and its internal-gateway uat.abies.in
// alike), which a single hardcoded comparison never could.
function allowedOrigins(): Set<string> {
  const env = getEnv();
  const base = new URL(env.APP_BASE_URL).origin;
  const extra = (env.ADDITIONAL_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([base, ...extra]);
}

// Browsers always send Origin on a cross-origin-capable write (POST/PATCH/
// PUT/DELETE); a same-site form submission always carries it too. A
// missing Origin is treated the same as a mismatched one — refused, never
// silently allowed.
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin)) {
    throw new ForbiddenError('Cross-site request blocked');
  }
}
