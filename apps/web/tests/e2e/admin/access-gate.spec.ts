import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { promoteToOperator, registerAndVerify, loginViaUi } from '../support/auth.js';

let stack: Stack;
const nonOperator = { email: 'non-operator@example.com', password: 'correct-horse-battery-staple' };
const otherReal = {
  email: 'other-real-account@example.com',
  password: 'correct-horse-battery-staple',
};
const operator = { email: 'operator@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, nonOperator);
  await registerAndVerify(stack, otherReal);
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});
test.afterAll(async () => {
  if (stack !== undefined) await stack.stop();
});

test('anonymous direct dashboard/admin URLs go to login without rendering protected shells', async ({
  page,
}) => {
  await page.goto(`${stack.webBaseUrl}/scan`);
  await expect(page).toHaveURL(/\/login\?next=%2Fscan$/);
  await expect(page.getByRole('heading', { name: 'What should we audit?' })).not.toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=%2Fscan$/);

  await page.goto(`${stack.webBaseUrl}/admin/users`);
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers$/);
  await expect(page.getByText('Platform')).not.toBeVisible();
});

test('a customer can use the dashboard but is returned to it from every admin deep link', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, nonOperator);
  await expect(page).toHaveURL(/\/scan$/);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  await expect(page).toHaveURL(/\/scan$/);
  await expect(page.getByText(otherReal.email)).not.toBeVisible();
});

test('an operator can enter the admin console after a direct navigation', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin`);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText(`operator · ${operator.email}`)).toBeVisible();
});
