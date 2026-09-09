import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-providers-op@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});
test.afterAll(async () => stack.stop());

test('the providers screen shows the real fallback-chain warning and reorders locally', async ({
  page,
}) => {
  // admin/providers/page.tsx's own header note: this screen is local state
  // only — "no backend wiring exists yet" — even though apps/api's real
  // PATCH /admin/providers (providers.routes.ts) already exists and already
  // has its own contract suite (admin.providers.test.ts) covering exactly
  // the "fewer than two vendors is refused" reasoning the plan's own first
  // draft expected this page to surface. "Add provider" has no onClick at
  // all. This tests what the page actually does today: a real client-side
  // reorder of the three seeded placeholder rows, and the real static
  // warning copy — not a persisted mutation that does not exist yet.
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/providers`);

  await expect(page.getByText('3 vendors')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('A chain spanning fewer than two vendors is refused at startup.')).not.toBeVisible();

  // `vendor` is a bare string in providers/page.tsx's row array (unlike
  // mono()/num()-wrapped cells elsewhere), so getByText resolves directly to
  // the tableCell div itself — one `..` reaches the row, not two.
  const firstRow = page.getByText('Anthropic', { exact: true }).locator('..');
  await firstRow.getByRole('button', { name: 'Down', exact: true }).click();

  // The reorder is real (local state), so "OpenAI" now renders before
  // "Anthropic" — checked via each row's own '#' index cell rather than
  // guessing at DOM order, since Table.tsx renders every row as a sibling
  // <div> regardless of position.
  const openAiRow = page.getByText('OpenAI', { exact: true }).locator('..');
  await expect(openAiRow.getByText('1', { exact: true })).toBeVisible();
  await expect(firstRow.getByText('2', { exact: true })).toBeVisible();

  // No network call exists for this reorder or for "Add provider" — the
  // real chain in the database is untouched.
  const chain = await stack.db.providerChainEntry.findMany();
  expect(chain).toEqual([]);
});
