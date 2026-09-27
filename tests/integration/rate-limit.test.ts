// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { redis } from '@/lib/redis';
import { checkRateLimit } from '@/server/rate-limit';

const testKeys: string[] = [];

function freshKey(): string {
  const key = `test:ratelimit:${randomInt(100000, 999999)}`;
  testKeys.push(key);
  return key;
}

afterAll(async () => {
  if (testKeys.length) await redis.del(...testKeys);
  redis.disconnect();
});

describe('checkRateLimit', () => {
  it('allows requests up to the limit and refuses the next one', async () => {
    const key = freshKey();
    expect(await checkRateLimit(key, 3, 60)).toBe(true);
    expect(await checkRateLimit(key, 3, 60)).toBe(true);
    expect(await checkRateLimit(key, 3, 60)).toBe(true);
    expect(await checkRateLimit(key, 3, 60)).toBe(false);
  });

  it('sets an expiry on the counter so it resets after the window', async () => {
    const key = freshKey();
    await checkRateLimit(key, 5, 60);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('tracks independent keys independently', async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    expect(await checkRateLimit(keyA, 1, 60)).toBe(true);
    expect(await checkRateLimit(keyA, 1, 60)).toBe(false);
    expect(await checkRateLimit(keyB, 1, 60)).toBe(true);
  });
});
