import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-caps-op@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});
test.afterAll(async () => stack.stop());

test('disabling a real capability persists and re-enables cleanly', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/capabilities`);
  // Table.tsx (components/admin/AdminShell.tsx) renders CSS-grid <div>s, not
  // a real <table>/<tr> — see admin/users.spec.ts's own note. The Capability
  // column shows the manifest's `name` ("Security Headers Checker"), not
  // its `id` ("headers-checker") — the DB lookup below uses the id.
  const row = page.getByText('Security Headers Checker', { exact: true }).locator('../..');
  await row.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Enable', exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const capability = await stack.db.capability.findUnique({ where: { id: 'headers-checker' } });
  expect(capability?.isEnabled).toBe(false);

  await row.getByRole('button', { name: 'Enable', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Disable', exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test('toggling a plan active/inactive persists the real change and writes an audit entry', async ({
  page,
}) => {
  // admin/plans/page.tsx's own header note: the mock's generic "Edit" action
  // was replaced with the one real mutation this screen has, PATCH
  // /admin/plans/:id toggling `isActive` — there is no monthly-credits edit
  // form (no create-plan form exists either, the same designed-but-not-yet-
  // wired precedent as the providers page's "Add provider"). The plan's own
  // first draft assumed an edit form and a "Starter" tier; this fixture's
  // seeded database only ever has the "Free" plan (support/stack.ts's
  // resetDb), so this tests the real mutation against the real seeded row.
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/plans`);
  const row = page.getByText('Free', { exact: true }).locator('../..');
  await row.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Activate', exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const plan = await stack.db.plan.findUnique({ where: { id: 'free' } });
  expect(plan?.isActive).toBe(false);

  const entry = await stack.db.auditLogEntry.findFirst({
    where: { subjectType: 'Plan', subjectId: 'free', action: 'plan.update' },
    orderBy: { createdAt: 'desc' },
  });
  expect(entry).not.toBeNull();

  await row.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible({
    timeout: 10_000,
  });
});
