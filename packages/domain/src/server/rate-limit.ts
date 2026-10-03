import { redis } from '../lib/redis';

// Redis INCR+EXPIRE fixed-window counter — the "implemented via Redis
// counters in the relevant module's service layer" rate limiting
// docs/SECURITY-MODEL.md has described since Phase 1, never actually built
// until now. This is IP-scoped defense-in-depth on top of the per-mobile
// OTP cooldown (modules/auth/auth.service.ts) that already existed — it
// catches an attacker hammering many *different* mobile numbers from one
// IP, which the per-mobile check alone can't see.
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}
