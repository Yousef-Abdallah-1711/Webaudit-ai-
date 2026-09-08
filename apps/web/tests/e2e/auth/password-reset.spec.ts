import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'reset-flow@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});
test.afterAll(async () => stack.stop());

test('requesting, following, and completing a real reset link lets the account sign in with the new password', async ({
  page,
}) => {
  await page.goto(`${stack.webBaseUrl}/forgot-password`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  // "Back to sign in" is in the page's `foot` in both states, so it can't
  // prove the request completed — lib/strings.ts's real copy for the
  // sent-only lead text can.
  await expect(
    page.getByText('If that address has an account, a reset link is on its way.'),
  ).toBeVisible({ timeout: 5_000 });

  const token = stack.mailer.lastResetToken();
  await page.goto(`${stack.webBaseUrl}/reset-password?token=${token}`);
  const newPassword = 'a-brand-new-password-123';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Set password and sign in', exact: true }).click();
  // lib/strings.ts's real copy: "Password changed"
  await expect(page.getByText('Password changed')).toBeVisible({ timeout: 5_000 });

  // The done state's "Sign in" control is a `<Button href="/login">`, which
  // renders an `<a>`, not a `<button>` — see components/ui/Button.tsx.
  // Scoped to `main` because the page header also has a "Sign in" link.
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL(/\/login$/);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);
});

test('an already-used reset link is refused, not silently accepted twice', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/forgot-password`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(
    page.getByText('If that address has an account, a reset link is on its way.'),
  ).toBeVisible({ timeout: 5_000 });

  const token = stack.mailer.lastResetToken();
  await page.goto(`${stack.webBaseUrl}/reset-password?token=${token}`);
  const firstPassword = 'first-new-password-123';
  await page.getByLabel('New password', { exact: true }).fill(firstPassword);
  await page.getByLabel('Confirm new password').fill(firstPassword);
  await page.getByRole('button', { name: 'Set password and sign in', exact: true }).click();
  await expect(page.getByText('Password changed')).toBeVisible({ timeout: 5_000 });

  await page.goto(`${stack.webBaseUrl}/reset-password?token=${token}`);
  const secondPassword = 'second-new-password-456';
  await page.getByLabel('New password', { exact: true }).fill(secondPassword);
  await page.getByLabel('Confirm new password').fill(secondPassword);
  await page.getByRole('button', { name: 'Set password and sign in', exact: true }).click();
  // lib/strings.ts's real copy for a 410 (already-used/expired) token.
  await expect(page.getByText('It has already been used, or it expired.')).toBeVisible({ timeout: 5_000 });
});

test('mismatched passwords are refused before submission', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/forgot-password`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(
    page.getByText('If that address has an account, a reset link is on its way.'),
  ).toBeVisible({ timeout: 5_000 });

  const token = stack.mailer.lastResetToken();
  await page.goto(`${stack.webBaseUrl}/reset-password?token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill('one-password-123456');
  await page.getByLabel('Confirm new password').fill('a-different-password-123');
  // lib/strings.ts's real copy: "Passwords do not match."
  await expect(page.getByText('Passwords do not match.')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Set password and sign in', exact: true })).toBeDisabled();
});
