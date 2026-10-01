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
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);
  await expect(page).not.toHaveURL(/\?email=/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const user = await stack.db.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user?.emailVerifiedAt).toBeNull();
});

test('pressing Enter in the password field submits a valid signup form', async ({ page }) => {
  const email = 'enter-signup@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('valid-password-1234');
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);

  const user = await stack.db.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user?.emailVerifiedAt).toBeNull();
});

test('registering the same address twice shows the uniform verification response', async ({
  page,
}) => {
  const email = 'duplicate-signup@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);

  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('another-correct-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);
  await expect(page).not.toHaveURL(/\?email=/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test('following the real verification link lets the account sign in', async ({ page }) => {
  const email = 'verify-link@example.com';
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);

  const token = stack.mailer.lastVerificationToken();
  await page.goto(`${stack.webBaseUrl}/verify-email?token=${token}`);
  const confirmButton = page.getByRole('button', { name: 'Confirm Email Address' });
  await expect(confirmButton).toBeVisible();
  const userBeforeConfirmation = await stack.db.user.findUnique({ where: { email } });
  expect(userBeforeConfirmation?.emailVerifiedAt).toBeNull();
  await confirmButton.click();
  // The confirmed outcome's "Sign in" label is `verify_confirmed_submit` in
  // `messages/en/auth.json`. Its control is a `<Button href="/login">`, which renders
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
