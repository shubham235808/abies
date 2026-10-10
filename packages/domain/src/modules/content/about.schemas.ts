import { z } from 'zod';

// Singleton upsert keyed to the fixed 'about-us' slug. The admin UI now
// manages about-us through the generic pages manager (pages.service); this
// endpoint is kept for existing API callers.
export const upsertAboutPageSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  active: z.boolean().default(true),
});
