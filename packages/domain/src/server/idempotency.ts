import { prisma } from '../lib/db';

export interface IdempotentResult {
  status: number;
  body: unknown;
}

// Replays a prior response for the same (user, route, key) instead of
// re-running a booking/order write — protects a retried POST (a dropped
// response on a flaky mobile connection, not just a dropped request; see
// docs/mobile/IMPLEMENTATION-PLAN.md Phase 8) from creating a duplicate
// booking. A caller with no Idempotency-Key header just runs normally,
// same as before this existed — the header is optional, not required.
//
// Only a *successful* run() is ever stored. A run() that throws has no
// side effect to protect against duplicating, so there is nothing to cache —
// the caller's error propagates exactly as it did before this wrapper.
export async function withIdempotency(
  userId: string,
  route: string,
  key: string | null | undefined,
  run: () => Promise<IdempotentResult>,
): Promise<IdempotentResult> {
  if (!key) return run();

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_route_key: { userId, route, key } },
  });
  if (existing) return { status: existing.statusCode, body: existing.responseBody };

  const result = await run();
  try {
    await prisma.idempotencyRecord.create({
      data: { userId, route, key, statusCode: result.status, responseBody: result.body as never },
    });
  } catch {
    // Lost a race with a concurrent call using the same key — replay its
    // stored result rather than our own, so both callers see one outcome.
    const raced = await prisma.idempotencyRecord.findUnique({ where: { userId_route_key: { userId, route, key } } });
    if (raced) return { status: raced.statusCode, body: raced.responseBody };
    throw new Error(`Idempotency record for ${route} could not be read back after a write conflict`);
  }
  return result;
}
