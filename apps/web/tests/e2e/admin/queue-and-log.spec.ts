import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const operator = { email: 'admin-queue-op@example.com', password: 'correct-horse-battery-staple' };
const customer = { email: 'queue-customer@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
  await registerAndVerify(stack, customer);
});

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('a real completed scan appears in admin/scans, and a real plan edit appears in the audit log', async ({
  page,
  context,
}) => {
  // admin/scans/page.tsx and admin/log/page.tsx shipped as Server
  // Components rendering hardcoded placeholder rows with no backend call at
  // all — GET /admin/scans and GET /admin/audit-log (and the two pages'
  // real wiring) were built alongside this test to close that gap.
  const customerPage = await context.newPage();
  await loginViaUi(customerPage, stack.webBaseUrl, customer);
  await runScanToCompletion(customerPage, fixture);
  await customerPage.close();

  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/scans`);
  await expect(page.getByText(customer.email, { exact: true })).toBeVisible({ timeout: 10_000 });

  // admin/plans/page.tsx's only real mutation is toggling `isActive` — see
  // admin/capabilities-and-plans.spec.ts's own note. Toggling it writes the
  // real `plan.update` audit entry this test then looks for.
  await page.goto(`${stack.webBaseUrl}/admin/plans`);
  const planRow = page.getByText('Free', { exact: true }).locator('../..');
  await planRow.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(planRow.getByRole('button', { name: 'Activate', exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await page.goto(`${stack.webBaseUrl}/admin/log`);
  await expect(page.getByText('plan.update', { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(operator.email, { exact: true }).first()).toBeVisible();
});
