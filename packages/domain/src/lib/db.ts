import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { getEnv } from './env';

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads in dev; a fresh client per
// serverless cold start elsewhere.
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
