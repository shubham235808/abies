import { describe, expect, it } from 'vitest';

// Guards the exact bug this replaces: UAT genuinely answers on two
// hostnames for the same backend (abies.in publicly, uat.abies.in via the
// internal gateway) — a single hardcoded APP_BASE_URL comparison rejected
// the second one as "cross-site" even though it wasn't. ADDITIONAL_ALLOWED_ORIGINS
// must be set before the first getEnv() call anywhere in this file's
// module graph (it caches), so this happens at module scope, not in a
// beforeEach, same constraint as the msg91-adapter tests.
process.env.ADDITIONAL_ALLOWED_ORIGINS = 'https://uat.abies.in, https://extra.example.test';

const { assertSameOrigin } = await import('../../packages/domain/src/server/origin');

function reqWithOrigin(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  return new Request('http://localhost:3000/api/v1/contact', { method: 'POST', headers });
}

describe('assertSameOrigin', () => {
  it('allows the primary APP_BASE_URL origin (.env: http://localhost:3000)', () => {
    expect(() => assertSameOrigin(reqWithOrigin('http://localhost:3000'))).not.toThrow();
  });

  it('allows each additional configured origin', () => {
    expect(() => assertSameOrigin(reqWithOrigin('https://uat.abies.in'))).not.toThrow();
    expect(() => assertSameOrigin(reqWithOrigin('https://extra.example.test'))).not.toThrow();
  });

  it('rejects an origin not on the allowlist', () => {
    expect(() => assertSameOrigin(reqWithOrigin('https://evil.example.test'))).toThrow(/cross-site/i);
  });

  it('rejects a missing Origin header rather than silently allowing it', () => {
    expect(() => assertSameOrigin(reqWithOrigin(null))).toThrow(/cross-site/i);
  });
});
