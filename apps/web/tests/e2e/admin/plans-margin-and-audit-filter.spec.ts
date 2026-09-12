/**
 * Group E — three real admin controls with no prior real-browser coverage.
 * Reading the current source (not the stale header comments on these two
 * pages, both corrected alongside this spec) showed all three are genuinely
 * wired, not decorative: plan creation (`POST /admin/plans`), the margin
 * CSV export (`GET /admin/margin/export`), and audit-log filtering
 * (`GET /admin/audit-log?action=&actorId=...`).
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = {
  email: 'admin-plans-margin-op@example.com',
  password: 'correct-horse-battery-staple',
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});
test.afterAll(async () => stack.stop());

test('creating a plan, exporting the margin CSV, and filtering the audit log are all real', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, operator);

  // A decoy `plan.update` audit entry (toggling the seeded "free" plan) —
  // proves the filter in step 3 actually narrows results rather than always
  // showing everything.
  await page.goto(`${stack.webBaseUrl}/admin/plans`);
  const freeRow = page.getByText('Free', { exact: true }).locator('../..');
  await freeRow.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(freeRow.getByRole('button', { name: 'Activate', exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // 1. Plan creation is a real POST, not an inert button.
  await page.getByRole('button', { name: 'New plan' }).click();
  const planId = `e2e-plan-${String(Date.now())}`;
  await page.getByLabel('Plan ID').fill(planId);
  await page.getByLabel('Name').fill('E2E Test Tier');
  await page.getByLabel('Monthly credits').fill('777');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByText('E2E Test Tier')).toBeVisible({ timeout: 10_000 });

  const created = await stack.db.plan.findUnique({ where: { id: planId } });
  expect(created).not.toBeNull();
  expect(created?.monthlyCredits).toBe(777);
  const createAudit = await stack.db.auditLogEntry.findFirst({
    where: { action: 'plan.create', subjectId: planId },
  });
  expect(createAudit).not.toBeNull();

  // 2. The margin "Export" button downloads a real CSV file, not a no-op.
  await page.goto(`${stack.webBaseUrl}/admin/billing`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('margin-report.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.length).toBeGreaterThan(0);

  // 3. The audit log's Action filter genuinely narrows results server-side:
  // unfiltered, both `plan.create` and the decoy `plan.update` are visible;
  // filtered to "plan.create", only that one remains.
  await page.goto(`${stack.webBaseUrl}/admin/log`);
  await expect(page.getByText('plan.create').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('plan.update').first()).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Filter action').fill('plan.create');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText('plan.create').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('plan.update')).toHaveCount(0);
});
