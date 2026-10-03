import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// EXPANSION-5 — tests import @abies/domain by its real package specifier
// now, not a '@/*' alias. The one exception: tests/unit/home-page.test.tsx
// imports apps/client-web's own page.tsx directly, which internally still
// uses client-web's OWN '@/*' -> client-web/src/* alias (correct — every
// app keeps that convention for its own local files) — so this alias is
// scoped to resolving that one app's "@/", not a workspace-wide thing.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './apps/client-web/src'),
    },
  },
});
