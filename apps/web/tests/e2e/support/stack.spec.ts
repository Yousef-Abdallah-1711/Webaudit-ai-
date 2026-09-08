import { test, expect } from '@playwright/test';
import { startStack, type Stack } from './stack.js';

let stack: Stack;

test.beforeAll(async () => {
  // Playwright's `beforeAll` has no timeout parameter of its own —
  // `test.setTimeout` inside the hook is the documented way to extend it
  // past the config's default 60s, which `startStack`'s real `next build`
  // exceeds (matching `accessibility.spec.ts`'s own precedent).
  test.setTimeout(180_000);
  stack = await startStack();
});

test.afterAll(async () => {
  await stack.stop();
});

test('boots a real api, worker, and web frontend that can reach each other', async ({ page }) => {
  const apiHealth = await page.request.get(`${stack.apiBaseUrl}/health`);
  expect(apiHealth.ok()).toBe(true);

  await page.goto(stack.webBaseUrl);
  await expect(page).toHaveTitle(/WebAudit/i);

  // The real regression this fixture exists to catch: a frontend that can't
  // reach its own API because of a CORS/WEB_URL mismatch renders the login
  // page fine (it's static) but the login FORM fails silently. Prove the
  // preflight the browser would send is actually allowed.
  const preflight = await page.request.fetch(`${stack.apiBaseUrl}/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: stack.webBaseUrl,
      'Access-Control-Request-Method': 'POST',
    },
  });
  expect(preflight.headers()['access-control-allow-origin']).toBe(stack.webBaseUrl);
});
