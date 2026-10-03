import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 CLI config (migrate/studio/seed). Application code never reads
// this file directly — it constructs its own driver adapter in
// src/lib/db.ts. See docs/DECISIONS.md D7.
//
// EXPANSION-5 — one shared .env lives at the workspace root (not
// duplicated per package); every pnpm command here runs with this
// package's directory as cwd, so dotenv's default (cwd-relative) lookup
// has to be pointed there explicitly.
config({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
