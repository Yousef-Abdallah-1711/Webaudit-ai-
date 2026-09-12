import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';

let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
});
test.afterAll(async () => stack.stop());

test('a new account registers through the real form and lands on the verify-email waiting screen', async ({
  page,
}) => {
  const email = 'new-signup@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(/\/verify-email\?email=/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const user = await stack.db.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user?.emailVerifiedAt).toBeNull();
});

test('registering the same address twice is refused with a specific reason', async ({ page }) => {
  const email = 'duplicate-signup@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(/\/verify-email\?email=/);

  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('another-correct-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  // lib/strings.ts's real copy: "That address cannot be registered."
  await expect(page.getByText('That address cannot be registered.')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page).toHaveURL(`${stack.webBaseUrl}/signup`);
});

test('following the real verification link lets the account sign in', async ({ page }) => {
  const email = 'verify-link@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(/\/verify-email\?email=/);

  const token = stack.mailer.lastVerificationToken();
  await page.goto(`${stack.webBaseUrl}/verify-email?token=${token}`);
  // lib/strings.ts's real copy for the confirmed outcome. The confirmed
  // outcome's "Sign in" control is a `<Button href="/login">`, which renders
  // an `<a>`, not a `<button>` — see components/ui/Button.tsx. Scoped to
  // `main` because the page header also has a "Sign in" link.
  const confirmSignIn = page.getByRole('main').getByRole('link', { name: 'Sign in' });
  await expect(confirmSignIn).toBeVisible({ timeout: 5_000 });

  await confirmSignIn.click();
  await page.waitForURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);
});
