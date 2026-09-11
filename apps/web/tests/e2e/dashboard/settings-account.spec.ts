import { expect, test } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { loginViaUi, registerAndVerify, type Creds } from '../support/auth.js';

let stack: Stack;
const creds: Creds = {
  email: 'settings-account@example.com',
  password: 'correct-horse-battery-staple',
};
const changedPassword = 'new-correct-horse-battery-staple';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, creds);
});

test.afterAll(async () => {
  await stack.stop();
});

test('settings persists profile, changes password, and deletes the real account', async ({
  page,
  request,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/settings`);

  const name = page.getByRole('textbox').first();
  await expect(name).toHaveValue('');
  await name.fill('E2E Settings User');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(name).toHaveValue('E2E Settings User');

  await page.reload();
  await expect(page.getByRole('textbox').first()).toHaveValue('E2E Settings User');

  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByPlaceholder('Current password').fill('wrong-current-password');
  await page.getByPlaceholder('New password').fill(changedPassword);
  await page.getByRole('button', { name: 'Confirm password change' }).click();
  await expect(
    page.getByText('The current password was incorrect or the new password was invalid.'),
  ).toBeVisible();

  await page.getByPlaceholder('Current password').fill(creds.password);
  await page.getByPlaceholder('New password').fill(changedPassword);
  await page.getByRole('button', { name: 'Confirm password change' }).click();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();

  const oldLogin = await request.post(`${stack.apiBaseUrl}/auth/login`, { data: creds });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await request.post(`${stack.apiBaseUrl}/auth/login`, {
    data: { email: creds.email, password: changedPassword },
  });
  expect(newLogin.status()).toBe(200);

  const deleteInput = page.getByRole('textbox').last();
  await deleteInput.fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.waitForURL(/\/login$/);

  const deletedLogin = await request.post(`${stack.apiBaseUrl}/auth/login`, {
    data: { email: creds.email, password: changedPassword },
  });
  expect(deletedLogin.status()).toBe(401);
});
