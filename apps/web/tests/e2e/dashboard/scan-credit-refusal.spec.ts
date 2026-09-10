import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

/**
 * Found via manual testing (Playwright MCP against a real dev stack):
 * submitting a quote the account could not afford showed "Insufficient
 * credits: 80 required, 50 available" on `ScanForm` — a real, correct
 * refusal — but the message stayed on screen even after deselecting areas
 * down to a quote the account could genuinely afford. `toggle()`
 * (`components/scan/ScanForm.tsx`) now clears the error on every selection
 * change, not only at the start of the next submit. Proven here against a
 * real browser, a real backend, and a real free-tier account (`50` real
 * credits), not just the jsdom-mocked `scan-form.test.ts`.
 */
let stack: Stack;
const creds = { email: 'credit-refusal@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('a stale "insufficient credits" refusal clears the moment the area selection changes', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);

  await page.getByPlaceholder('yoursite.com').fill('example.com');

  // All five areas are selected by default — 95 credits individually, quoted
  // at 80 bundled (packages/config's AREA_COST/quoteAreas) — more than the
  // free tier's real 50-credit grant either way.
  await page.getByRole('button', { name: 'Accept and run', exact: true }).click();
  const refusal = page.getByText(/Insufficient credits/);
  await expect(refusal).toBeVisible({ timeout: 10_000 });

  // Narrow to Performance + Security + Search visibility = 50 credits,
  // exactly the real balance — a selection the account can genuinely afford.
  await page.getByLabel('Design').uncheck();
  await page.getByLabel('Testing').uncheck();

  await expect(refusal).toHaveCount(0);
});
