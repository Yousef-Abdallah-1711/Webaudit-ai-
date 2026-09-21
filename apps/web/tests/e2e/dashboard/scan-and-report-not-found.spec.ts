import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

/**
 * Found via manual testing (Playwright MCP against a real dev stack, as User
 * B navigating directly to User A's scan URL): the backend correctly refused
 * with 404 "No such scan.", but `ScanProgressPage`/`ReportPage` (`app/
 * (dashboard)/scan/[id]/page.tsx`, `app/(dashboard)/reports/[id]/page.tsx`)
 * called `getScan`/`getReport` with no `.catch()`, so a rejected promise left
 * `hostname`/`report` at `null` forever and the page stayed on "Loading…"
 * indefinitely — no data leak, but a real UI defect (an infinite spinner
 * instead of the "Not found" state `billing/receipts/[id]/page.tsx` already
 * modeled for exactly this class of error). Both pages now catch the
 * rejection and render the API's own message.
 */
let stack: Stack;
const creds = { email: 'not-found-check@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('a scan id that is not yours (or does not exist) shows an error, not an endless spinner', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);

  await page.goto(`${stack.webBaseUrl}/scan/does-not-exist-00000000000000`);
  await expect(page.getByText('No such scan.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Loading…')).toHaveCount(0);
});

test('a report id that is not yours (or does not exist) shows an error, not an endless spinner', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);

  await page.goto(`${stack.webBaseUrl}/reports/does-not-exist-00000000000000`);
  await expect(page.getByText('No such scan.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Loading…')).toHaveCount(0);
});
