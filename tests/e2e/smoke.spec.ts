import { test, expect } from '@playwright/test';

// Placeholder until Phase 1+ land the mandatory end-to-end tests listed in
// docs/IMPLEMENTATION-PLAN.md. Keeps the Playwright suite non-empty so CI's
// e2e step has something real to run against the Phase 0 scaffold.
test('homepage loads and health endpoint is ok', async ({ page, request }) => {
  const health = await request.get('/api/v1/health/live');
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /trusted, coordinated ayurveda care/i })).toBeVisible();
});
