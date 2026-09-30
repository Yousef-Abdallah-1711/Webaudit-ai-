/**
 * P10 (master plan, Phase 10) — the admin journey's own bar: assign a plan,
 * grant credits, see the updated balance, and confirm the user's entitlement
 * actually changed (not just the label) by having them perform a
 * previously-refused action for real, through the real browser UI a real
 * operator would click.
 *
 * `admin.users-plan.test.ts` (Phase 3/9) already proves the entitlement
 * change at the API layer — this file is the missing browser-driven half:
 * the real `/admin/users` screen's "Assign plan" and "Grant credits" forms
 * (`apps/web/app/(admin)/admin/users/page.tsx`), including their
 * confirm-before-mutating dialog (discovery §11's own gap), actually work
 * end to end against a real operator session.
 */
import { test, expect } from '@playwright/test';
// Relative, not `@webaudit/safe-archive/testing` — apps/web has no dependency
// on packages/safe-archive at all (it never handles an archive itself; only
// apps/api/apps/worker do), and adding one merely to reach a test helper
// would be a real, if small, unwanted coupling. This is a devDependency-only
// test file reaching across the monorepo the same way vitest suites do.
import { buildBenignZip } from '../../../../../packages/safe-archive/tests/helpers/build-zip.js';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-journey-op@example.com', password: 'correct-horse-battery-staple' };
const target = { email: 'admin-journey-target@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
  await registerAndVerify(stack, target);
});
test.afterAll(async () => stack.stop());

async function login(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${stack.apiBaseUrl}/auth/login`, { data: target });
  expect(res.status()).toBe(200);
  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

test('assign a plan and grant credits through the real admin UI, then the user can actually use the new entitlement', async ({
  page,
  request,
}) => {
  const archive = buildBenignZip();

  // Before assignment: free tier refuses an uploaded-archive scan outright
  // (POST /scans/upload, PLAN_UPGRADE_REQUIRED) — the real entitlement gate
  // this journey exists to prove actually flips.
  const preToken = await login(request);
  const preUpload = await request.post(`${stack.apiBaseUrl}/scans/upload`, {
    headers: { Authorization: `Bearer ${preToken}` },
    multipart: { archive: { name: 'my-project.zip', mimeType: 'application/zip', buffer: archive } },
  });
  expect(preUpload.status(), await preUpload.text()).toBe(403);
  const preBody = (await preUpload.json()) as { error: { code: string } };
  expect(preBody.error.code).toBe('PLAN_UPGRADE_REQUIRED');

  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  await expect(page.getByText(target.email)).toBeVisible({ timeout: 10_000 });

  const row = page.getByText(target.email, { exact: true }).locator('../..');
  await row.getByRole('button', { name: 'View detail', exact: true }).click();
  await expect(page.getByText('Plan credits')).toBeVisible({ timeout: 10_000 });

  // --- Assign plan: free -> pro, no payment ---
  const assignForm = page.locator('form', { hasText: 'Assign plan (no payment)' });
  await assignForm.getByLabel('Plan').selectOption('pro');
  await assignForm.getByLabel('Reason').fill('Phase 10 admin-journey e2e: moving user onto pro');
  await assignForm.getByRole('button', { name: 'Review assignment', exact: true }).click();

  const confirmDialog = page.getByRole('alertdialog', { name: 'Confirm action' });
  await expect(confirmDialog).toContainText('Assign plan');
  await expect(confirmDialog).toContainText('pro');
  await confirmDialog.getByRole('button', { name: 'Confirm', exact: true }).click();

  const detail = page
    .getByText(`Actions for ${target.email}`, { exact: true })
    .locator('..')
    .locator('dl');
  await expect(detail).toContainText(/pro/i, { timeout: 10_000 });

  // --- Grant credits: a real, visible balance change ---
  const balanceBefore = await stack.db.creditLot.aggregate({
    where: { userId: (await stack.db.user.findUniqueOrThrow({ where: { email: target.email } })).id, kind: 'PURCHASED' },
    _sum: { amountRemaining: true },
  });
  const purchasedBefore = balanceBefore._sum.amountRemaining ?? 0;

  const grantForm = page.locator('form', { hasText: 'Grant credits' }).first();
  await grantForm.getByLabel('Amount').fill('75');
  await grantForm.getByLabel('Kind').selectOption('PURCHASED');
  await grantForm.getByLabel('Reason').fill('Phase 10 admin-journey e2e: real credit grant');
  await grantForm.getByRole('button', { name: 'Review grant', exact: true }).click();

  const grantConfirm = page.getByRole('alertdialog', { name: 'Confirm action' });
  await expect(grantConfirm).toContainText('Grant');
  await expect(grantConfirm).toContainText('75');
  await grantConfirm.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(detail).toContainText(String(purchasedBefore + 75), { timeout: 10_000 });

  const targetUser = await stack.db.user.findUniqueOrThrow({ where: { email: target.email } });
  const subscription = await stack.db.subscription.findUnique({ where: { userId: targetUser.id } });
  expect(subscription?.planId).toBe('pro');

  // --- The real proof: the user can now do what free never allowed ---
  const postToken = await login(request);
  const postUpload = await request.post(`${stack.apiBaseUrl}/scans/upload`, {
    headers: { Authorization: `Bearer ${postToken}` },
    multipart: { archive: { name: 'my-project.zip', mimeType: 'application/zip', buffer: archive } },
  });
  expect(postUpload.status(), await postUpload.text()).toBe(201);
});
