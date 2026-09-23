import Redis from 'ioredis';
import { getEnv } from './env';

declare global {
  var __redis: Redis | undefined;
}

function createClient() {
  // lazyConnect: Next.js evaluates route modules (including this import)
  // during build-time page-data collection, with no network access to
  // Redis yet — connecting eagerly there just produces noisy connection
  // errors. The first real command (e.g. in /api/ready) connects on demand.
  const client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  client.on('error', (err) => {
    console.error('[redis] connection error', err.message);
  });
  return client;
}

export const redis = globalThis.__redis ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
}
