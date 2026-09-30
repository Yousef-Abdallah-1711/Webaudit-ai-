import { expect, test } from '@playwright/test';
import { loginViaUi, promoteToOperator, registerAndVerify } from './support/auth.js';
import { startStack, type Stack } from './support/stack.js';

let stack: Stack;
const operator = {
  email: 'dashboard-mobile-overflow@example.com',
  password: 'correct-horse-battery-staple',
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env['REDIS_URL'] = 'redis://localhost:6389/15';
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});

test.afterAll(async () => {
  if (stack !== undefined) await stack.stop();
});

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${page.url()} at ${String(width)}px`).toBeLessThanOrEqual(width + 2);
}

test('dashboard and admin pages fit their mobile and tablet viewports, and admin drawer works', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaUi(page, stack.webBaseUrl, operator);

  await page.goto(`${stack.webBaseUrl}/settings`, { waitUntil: 'networkidle' });
  await expectNoHorizontalOverflow(page, 390);

  await page.goto(`${stack.webBaseUrl}/usage`, { waitUntil: 'networkidle' });
  await expectNoHorizontalOverflow(page, 390);

  await page.setViewportSize({ width: 768, height: 844 });
  await page.goto(`${stack.webBaseUrl}/settings`, { waitUntil: 'networkidle' });
  await expectNoHorizontalOverflow(page, 768);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${stack.webBaseUrl}/admin`, { waitUntil: 'networkidle' });
  await expectNoHorizontalOverflow(page, 390);

  const openDrawer = page.getByRole('button', { name: 'Open navigation menu', exact: true });
  await openDrawer.click();
  await expect(openDrawer).toHaveAttribute('aria-expanded', 'true');
  const sidebar = page.locator('#admin-sidebar');
  await expect(sidebar).toBeVisible();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? Number.NEGATIVE_INFINITY)
    .toBeGreaterThanOrEqual(-2);
  const sidebarBounds = await sidebar.boundingBox();
  expect(sidebarBounds).not.toBeNull();
  expect((sidebarBounds?.x ?? 0) + (sidebarBounds?.width ?? 0)).toBeLessThanOrEqual(392);

  await page.keyboard.press('Escape');
  await expect(openDrawer).toHaveAttribute('aria-expanded', 'false');

  await openDrawer.click();
  await expect(openDrawer).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#admin-sidebar + div[aria-hidden="true"]').click({
    position: { x: 380, y: 400 },
  });
  await expect(openDrawer).toHaveAttribute('aria-expanded', 'false');

  await page.goto(`${stack.webBaseUrl}/admin/users`, { waitUntil: 'networkidle' });
  await expectNoHorizontalOverflow(page, 390);
});
