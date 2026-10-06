import { NextResponse, type NextRequest } from 'next/server';
import { getEnv } from '@abies/domain/lib/env';
import { checkRateLimit } from '@abies/domain/server/rate-limit';

// Next.js 16 renamed middleware.ts -> proxy.ts (same behavior, Node.js
// runtime by default — see node_modules/next/dist/docs/.../proxy.md) which
// is why this can call Redis directly instead of needing an Edge-safe HTTP
// call to some other rate-limit service.
//
// Scoped to paths that don't need the request body (IP + path is enough),
// so there's no need to consume/reconstruct the body stream for a
// downstream route handler to read again. Per-mobile OTP cooldown
// (modules/auth/auth.service.ts) already exists at the DB layer; this adds
// an IP-scoped layer on top for the handful of endpoints an anonymous or
// low-trust caller can hit without an authenticated session.
interface RateLimitRule {
  prefix: string;
  method?: string;
  limit: (env: ReturnType<typeof getEnv>) => number;
  windowSeconds: (env: ReturnType<typeof getEnv>) => number;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    prefix: '/api/v1/auth/otp/request',
    limit: (env) => env.RATE_LIMIT_OTP_REQUEST_MAX,
    windowSeconds: (env) => env.RATE_LIMIT_OTP_REQUEST_WINDOW_SECONDS,
  },
  {
    prefix: '/api/v1/support/tickets',
    method: 'POST',
    limit: (env) => env.RATE_LIMIT_TICKET_CREATE_MAX,
    windowSeconds: (env) => env.RATE_LIMIT_TICKET_CREATE_WINDOW_SECONDS,
  },
  {
    prefix: '/api/v1/contact',
    method: 'POST',
    limit: (env) => env.RATE_LIMIT_CONTACT_MAX,
    windowSeconds: (env) => env.RATE_LIMIT_CONTACT_WINDOW_SECONDS,
  },
  {
    prefix: '/api/v1/payments/webhook',
    limit: (env) => env.RATE_LIMIT_WEBHOOK_MAX,
    windowSeconds: (env) => env.RATE_LIMIT_WEBHOOK_WINDOW_SECONDS,
  },
];

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rule = RATE_LIMIT_RULES.find(
    (r) => pathname.startsWith(r.prefix) && (!r.method || r.method === request.method),
  );

  if (rule) {
    const env = getEnv();
    const key = `ratelimit:${rule.prefix}:${clientIp(request)}`;
    const allowed = await checkRateLimit(key, rule.limit(env), rule.windowSeconds(env));
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests — please try again shortly.' }, { status: 429 });
    }
  }

  // Correlates one request's route-handler logs, error responses, and
  // (via metadata a caller chooses to attach) audit events — see
  // src/lib/logger.ts. Exposed back to the client too so a support agent
  // can ask "what did the x-request-id header say" when debugging a report.
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
