import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

// Readiness probe: process is up AND its dependencies (database, cache) are
// reachable. Deployment tooling should wait for this before routing traffic.
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = { database: 'error', redis: 'error' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    // left as 'error'
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    // left as 'error'
  }

  const ready = Object.values(checks).every((v) => v === 'ok');
  return Response.json({ ready, checks }, { status: ready ? 200 : 503 });
}
