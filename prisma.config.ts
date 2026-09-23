import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 CLI config (migrate/studio/seed). Application code never reads
// this file directly — it constructs its own driver adapter in
// src/lib/db.ts. See docs/DECISIONS.md D7.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
