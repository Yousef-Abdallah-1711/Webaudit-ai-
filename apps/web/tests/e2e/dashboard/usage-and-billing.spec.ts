import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'usage-billing@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('billing shows the real starting plan-credit balance for a fresh free-tier account', async ({
  page,
}) => {
  // /usage is not this test's target: its own header comment says plainly
  // it is 100% the vendored source's placeholder demo data ("980", "1,120",
  // a fake 24-day chart) — real numbers are explicitly out of scope until a
  // later task (T158+, US5). /billing is the screen actually wired to the
  // real GET /billing/credits, and it is where a fresh account's true
  // balance is visible today.
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/billing`);
  const planCreditsLabel = page.getByText('Plan credits', { exact: true });
  await expect(planCreditsLabel).toBeVisible({ timeout: 10_000 });
  // "Plan credits" and its "50" value are siblings under one immediate
  // parent (billing/page.tsx's balanceGrid) — scoping to that parent avoids
  // the unrelated "50 credits, once" text in the "Choose a plan" grid below.
  await expect(planCreditsLabel.locator('..').getByText('50', { exact: true })).toBeVisible();
});

test('a free-tier account cannot purchase credits — the real entitlement refusal is visible', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/billing`);
  // The free plan's allowCreditPurchase is false — apps/api's purchase route
  // refuses with EntitlementError before any charge, per FR-078.
  await page.getByRole('button', { name: 'Buy credits', exact: true }).click();
  await expect(
    page.getByText(/Purchasing additional credits requires the .+ plan or higher/),
  ).toBeVisible({
    timeout: 10_000,
  });
});
