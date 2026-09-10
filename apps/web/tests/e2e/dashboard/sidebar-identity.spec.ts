import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

/**
 * Found via manual testing (Playwright MCP against a real dev stack): the
 * sidebar (`components/dashboard/Sidebar.tsx`) showed the vendored source's
 * exact placeholder identity — "Khalid Ahmed", "Pro plan", "1,120 credits" —
 * for every signed-in account, real or not. `GET /auth/me` and
 * `GET /billing/plans` now back it for real; this proves it against a real
 * browser, a real backend, and a real freshly-registered free-tier account,
 * not just the jsdom-mocked `sidebar-live.test.ts`.
 */
let stack: Stack;
const creds = { email: 'sidebar-identity@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('the sidebar shows the real signed-in account, not the vendored placeholder identity', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);

  const sidebar = page.locator('aside');
  await expect(sidebar.getByText(creds.email, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(sidebar.getByText('Free plan', { exact: true })).toBeVisible();
  // A fresh free-tier registration grants exactly 50 credits (T038's own
  // schedule) — real, not the fixed "1,120" the vendored source ships.
  await expect(sidebar.getByText('50', { exact: true })).toBeVisible();

  await expect(sidebar.getByText('Khalid Ahmed', { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText('Pro plan', { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText('1,120', { exact: true })).toHaveCount(0);
});
