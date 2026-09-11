import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, type Creds } from '../support/auth.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const previousRedisUrl = process.env['REDIS_URL'];
const creds: Creds = {
  email: 'usage-real-data@example.com',
  password: 'correct-horse-battery-staple',
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  process.env['REDIS_URL'] = 'redis://localhost:6389/15';
  stack = await startStack();
  await registerAndVerify(stack, creds);
});

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
  if (previousRedisUrl === undefined) delete process.env['REDIS_URL'];
  else process.env['REDIS_URL'] = previousRedisUrl;
});

test('usage reflects a completed scan and exports the same real data', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.getByPlaceholder('yoursite.com').fill(`${fixture.origin}/`);
  await page.getByLabel('Performance').uncheck();
  await page.getByLabel('Design').uncheck();
  await page.getByLabel('Testing').uncheck();
  await page.getByRole('button', { name: 'Accept and run', exact: true }).click();
  await page.waitForURL(/\/scan\/[^/]+$/);
  await page.getByRole('button', { name: 'Open report' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/reports\/[^/]+$/);

  await page.goto(`${stack.webBaseUrl}/usage`);
  const auditsCard = page.getByText('Audits run').locator('..');
  await expect(auditsCard).toContainText('1');
  const spentCard = page.getByText('Spent this period').locator('..');
  await expect(spentCard).toContainText('30');
  await expect(page.getByText('Khalid Ahmed')).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('webaudit-usage.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('daily_spend');
  expect(csv).toContain('area');
});
