import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-users-op@example.com', password: 'correct-horse-battery-staple' };
const listedUser = { email: 'listed-user@example.com', password: 'irrelevant-password-123' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
  await registerAndVerify(stack, listedUser);
});
test.afterAll(async () => stack.stop());

test('a real operator sees the real user list, and can promote another account', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  await expect(page.getByText(listedUser.email)).toBeVisible({ timeout: 10_000 });

  // Table.tsx (components/admin/AdminShell.tsx) renders a CSS-grid of
  // <div>s, not a real <table>/<tr> — the plan's own first draft assumed a
  // semantic table that does not exist. Locating the row via the email
  // cell's own two ancestors (cell -> row) reaches the same row's toggle
  // button without guessing at a hashed CSS-module class name. A bare `..`
  // is Playwright's own auto-detected XPath shorthand for "parent".
  const row = page.getByText(listedUser.email, { exact: true }).locator('../..');
  await row.getByRole('button', { name: 'Make operator', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Remove operator', exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const promoted = await stack.db.user.findUnique({ where: { email: listedUser.email } });
  expect(promoted?.isOperator).toBe(true);
});
