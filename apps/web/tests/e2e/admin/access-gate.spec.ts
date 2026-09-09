import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

let stack: Stack;
const nonOperator = { email: 'non-operator@example.com', password: 'correct-horse-battery-staple' };
const otherReal = { email: 'other-real-account@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, nonOperator);
  await registerAndVerify(stack, otherReal);
});
test.afterAll(async () => stack.stop());

test('a genuine non-operator account cannot see admin data even after navigating to /admin/users', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, nonOperator);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  // CLAUDE.md: "Frontend route guards are usability, never security" — the
  // page renders its shell regardless, but auth.middleware.ts's real
  // requireOperator refuses the data fetch server-side with this exact
  // message (FORBIDDEN, 403). Assert that real refusal, not a client
  // redirect a hostile client could skip.
  await expect(page.getByText('Operator access required.')).toBeVisible({ timeout: 10_000 });
  // AHead's real account count only renders once a fetch actually succeeds
  // (admin-error-paths.test.ts's own regression for the "fabricated 0
  // accounts" defect) — its absence, plus the other real account's email
  // never appearing, proves no data leaked past the refusal.
  await expect(page.getByText('accounts')).not.toBeVisible();
  await expect(page.getByText(otherReal.email)).not.toBeVisible();
});
