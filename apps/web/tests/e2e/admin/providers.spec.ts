import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = {
  email: 'admin-providers-op@example.com',
  password: 'correct-horse-battery-staple',
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
});
test.afterAll(async () => stack.stop());

test('reordering the real provider chain persists across a reload and is audited', async ({
  page,
}) => {
  // admin/providers/page.tsx now calls the real, pre-existing (T208)
  // GET/PATCH /admin/providers endpoints (providers.routes.ts,
  // providers.service.ts) instead of holding three decorative local-state
  // rows — confirmed by reading the current component, which fetches via
  // `getAdminProviders()` and calls `persist()` (a real PATCH) on every
  // Up/Down click. A real chain must exist in the database for this screen
  // to show anything, so this spec seeds one directly (the same shape
  // `replaceProviderChain` itself writes) rather than assuming a placeholder.
  await stack.db.providerChainEntry.createMany({
    data: [
      { vendor: 'Anthropic', model: 'claude-x', position: 0, isEnabled: true },
      { vendor: 'OpenAI', model: 'gpt-x', position: 1, isEnabled: true },
      { vendor: 'Google', model: 'gemini-x', position: 2, isEnabled: true },
    ],
  });

  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/providers`);

  await expect(page.getByText('3 vendors')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText('A chain spanning fewer than two vendors is refused at startup.'),
  ).not.toBeVisible();

  // `vendor` is a bare string in providers/page.tsx's row array (unlike
  // mono()/num()-wrapped cells elsewhere), so getByText resolves directly to
  // the tableCell div itself — one `..` reaches the row, not two.
  const firstRow = page.getByText('Anthropic', { exact: true }).locator('..');
  await firstRow.getByRole('button', { name: 'Down', exact: true }).click();

  // The reorder is a real PATCH — "OpenAI" now renders before "Anthropic",
  // checked via each row's own '#' index cell rather than guessing at DOM
  // order, since Table.tsx renders every row as a sibling <div> regardless
  // of position.
  const openAiRow = page.getByText('OpenAI', { exact: true }).locator('..');
  await expect(openAiRow.getByText('1', { exact: true })).toBeVisible();
  await expect(firstRow.getByText('2', { exact: true })).toBeVisible();

  // Persistence, proven by a fresh GET on reload — not just optimistic
  // client state surviving in memory.
  await page.reload();
  await expect(
    page.getByText('OpenAI', { exact: true }).locator('..').getByText('1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Anthropic', { exact: true }).locator('..').getByText('2', { exact: true }),
  ).toBeVisible();

  const chain = await stack.db.providerChainEntry.findMany({ orderBy: { position: 'asc' } });
  expect(chain.map((row) => row.vendor)).toEqual(['OpenAI', 'Anthropic', 'Google']);

  const audit = await stack.db.auditLogEntry.findFirst({
    where: { action: 'providers.chain_replace' },
    orderBy: { createdAt: 'desc' },
  });
  expect(audit).not.toBeNull();
});
