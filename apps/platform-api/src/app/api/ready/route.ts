import { prisma } from '@abies/domain/lib/db';
import { redis } from '@abies/domain/lib/redis';
import { checkStorageHealth } from '@abies/domain/lib/storage';

// Readiness probe: process is up AND its dependencies (database, cache,
// object storage) are reachable. Deployment tooling should wait for this
// before routing traffic.
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = { database: 'error', redis: 'error', storage: 'error' };

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

  checks.storage = (await checkStorageHealth()) ? 'ok' : 'error';

  const ready = Object.values(checks).every((v) => v === 'ok');
  return Response.json({ ready, checks }, { status: ready ? 200 : 503 });
}
