import { test, expect } from '@playwright/test';
import { startStack, type Stack } from './stack.js';
import { registerAndVerify, loginViaUi } from './auth.js';

let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
});
test.afterAll(async () => stack.stop());

test('registerAndVerify + loginViaUi lands on the real dashboard', async ({ page }) => {
  const creds = { email: 'helper-check@example.com', password: 'correct-horse-battery-staple' };
  await registerAndVerify(stack, creds);
  await loginViaUi(page, stack.webBaseUrl, creds);
  await expect(page).toHaveURL(/\/scan$/);
});
