import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'login-flow@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('correct credentials reach the dashboard', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);
});

test('wrong password shows the real, specific error — not a generic network failure', async ({
  page,
}) => {
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // lib/strings.ts's real copy: "Incorrect email or password."
  await expect(page.getByText('Incorrect email or password.')).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/login$/);
});

test('an unverified account is refused with a specific reason, not silently logged in', async ({
  page,
}) => {
  const unverified = { email: 'unverified@example.com', password: 'correct-horse-battery-staple' };
  const res = await fetch(`${stack.apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unverified),
  });
  if (res.status !== 201) {
    throw new Error(`register failed: ${String(res.status)} ${await res.text()}`);
  }
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(unverified.email);
  await page.getByLabel('Password').fill(unverified.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // lib/strings.ts's real copy: "Confirm your address first."
  await expect(page.getByText('Confirm your address first.')).toBeVisible({ timeout: 5_000 });
});
